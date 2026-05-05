using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SyncPlayChat;

/// <summary>
/// Registers plugin services into Jellyfin's dependency injection container.
/// Requires a parameterless constructor (per IPluginServiceRegistrator contract).
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<ChatService>();
        serviceCollection.AddHostedService<SyncPlayChatEntryPoint>();
    }
}
