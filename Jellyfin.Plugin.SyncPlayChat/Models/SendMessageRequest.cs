namespace Jellyfin.Plugin.SyncPlayChat.Models;

/// <summary>
/// Request body for sending a chat message.
/// </summary>
public class SendMessageRequest
{
    /// <summary>
    /// Gets or sets the message content (max 500 characters).
    /// </summary>
    public string? Content { get; set; }
}
