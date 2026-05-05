using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Loader;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SyncPlayChat.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

// The GuidAttribute is required for Jellyfin to correctly identify the plugin ID from the assembly.
[assembly: Guid("c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c")]

namespace Jellyfin.Plugin.SyncPlayChat;

/// <summary>
/// The main plugin class for Jellyfin SyncPlayChat.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    /// <param name="logger">The logger instance.</param>
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer,
        ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <inheritdoc />
    public override string Name => "SyncPlayChat";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c");

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = string.Format(
                    CultureInfo.InvariantCulture,
                    "{0}.Configuration.configPage.html",
                    GetType().Namespace)
            }
        ];
    }
}

/// <summary>
/// Hosted service that registers the File Transformation plugin injection on startup.
/// </summary>
public class SyncPlayChatEntryPoint : IHostedService
{
    private readonly ILogger<SyncPlayChatEntryPoint> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="SyncPlayChatEntryPoint"/> class.
    /// </summary>
    /// <param name="logger">The logger.</param>
    public SyncPlayChatEntryPoint(ILogger<SyncPlayChatEntryPoint> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        RegisterFileTransformation();
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>
    /// Registers a script injection with the File Transformation plugin (if installed)
    /// via reflection, since plugins run in isolated AssemblyLoadContexts.
    /// </summary>
    private void RegisterFileTransformation()
    {
        try
        {
            Assembly? ftAssembly = null;
            foreach (var context in AssemblyLoadContext.All)
            {
                foreach (var assembly in context.Assemblies)
                {
                    if (assembly.FullName?.Contains("FileTransformation", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        ftAssembly = assembly;
                        break;
                    }
                }

                if (ftAssembly != null)
                {
                    break;
                }
            }

            if (ftAssembly == null)
            {
                _logger.LogWarning(
                    "[SyncPlayChat] jellyfin-plugin-file-transformation is not installed. " +
                    "The chat overlay will not be injected into the Jellyfin Web client. " +
                    "Install it from: https://www.iamparadox.dev/jellyfin/plugins/manifest.json");
                return;
            }

            var pluginInterfaceType = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            if (pluginInterfaceType == null)
            {
                _logger.LogWarning("[SyncPlayChat] Could not locate PluginInterface in FileTransformation assembly.");
                return;
            }

            // Payload format required by File Transformation plugin
            var payload = JsonSerializer.Serialize(new
            {
                id = Plugin.Instance?.Id.ToString() ?? Guid.NewGuid().ToString(),
                fileNamePattern = "index\\.html$",
                callbackAssembly = typeof(FileTransformationCallback).Assembly.FullName,
                callbackClass = typeof(FileTransformationCallback).FullName,
                callbackMethod = nameof(FileTransformationCallback.Transform)
            });

            pluginInterfaceType
                .GetMethod("RegisterTransformation")?
                .Invoke(null, new object?[] { payload });

            _logger.LogInformation("[SyncPlayChat] Registered File Transformation for index.html.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SyncPlayChat] Failed to register File Transformation.");
        }
    }
}

/// <summary>
/// Callback invoked by the File Transformation plugin to modify the served index.html.
/// </summary>
public static class FileTransformationCallback
{
    /// <summary>
    /// Injects the SyncPlayChat client script tag before the closing body tag.
    /// </summary>
    /// <param name="context">JSON string with a "contents" property.</param>
    /// <returns>Modified JSON string with the patched contents.</returns>
    public static string Transform(string context)
    {
        try
        {
            using var doc = JsonDocument.Parse(context);
            var contents = doc.RootElement.GetProperty("contents").GetString() ?? string.Empty;

            const string scriptTag = "<script src=\"/SyncPlayChat/client.js\" defer></script>";
            const string closingBody = "</body>";

            if (!contents.Contains(scriptTag, StringComparison.Ordinal))
            {
                contents = contents.Replace(
                    closingBody,
                    scriptTag + "\n" + closingBody,
                    StringComparison.Ordinal);
            }

            return JsonSerializer.Serialize(new { contents });
        }
        catch
        {
            return context;
        }
    }
}
