using System;

namespace Jellyfin.Plugin.SyncPlayChat.Configuration;

/// <summary>
/// Plugin configuration for SyncPlayChat.
/// </summary>
public class PluginConfiguration : MediaBrowser.Model.Plugins.BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether the Syncplay chat overlay is enabled.
    /// </summary>
    public bool EnableChat { get; set; } = true;

    /// <summary>
    /// Gets or sets the maximum number of messages to show in history when joining a room.
    /// </summary>
    public int MaxHistoryMessages { get; set; } = 100;
}
