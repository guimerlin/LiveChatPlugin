using System;
using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SyncPlayChat.Controllers;

/// <summary>
/// Serves the embedded client-side JavaScript file for the Syncplay chat overlay.
/// </summary>
[ApiController]
[Route("SyncPlayChat")]
public class ClientScriptController : ControllerBase
{
    /// <summary>
    /// Serves the chat overlay JavaScript to the browser.
    /// </summary>
    /// <returns>The JavaScript file content.</returns>
    [HttpGet("client.js")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetClientScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        const string resourceName = "Jellyfin.Plugin.SyncPlayChat.Web.client.js";

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            return NotFound("Client script resource not found.");
        }

        using var reader = new StreamReader(stream);
        var content = reader.ReadToEnd();
        return Content(content, "text/javascript");
    }
}
