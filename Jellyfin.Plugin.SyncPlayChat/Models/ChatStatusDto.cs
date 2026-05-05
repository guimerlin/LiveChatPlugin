namespace Jellyfin.Plugin.SyncPlayChat.Models;

/// <summary>
/// DTO for the chat status response.
/// </summary>
public class ChatStatusDto
{
    /// <summary>
    /// Gets or sets a value indicating whether the user is currently in a SyncPlay group.
    /// </summary>
    public bool InSyncPlayGroup { get; set; }

    /// <summary>
    /// Gets or sets the active SyncPlay group ID, or null if not in a group.
    /// </summary>
    public string? GroupId { get; set; }
}
