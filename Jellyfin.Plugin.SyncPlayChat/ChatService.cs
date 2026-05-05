using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SyncPlayChat.Models;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SyncPlayChat;

/// <summary>
/// Service that manages in-memory chat messages per Syncplay group and broadcasts via Jellyfin WebSockets.
/// </summary>
public class ChatService
{
    private const int MaxMessagesPerGroup = 200;

    // We piggyback on SyncPlayGroupUpdate — the client JS identifies our messages
    // by the presence of the "syncplayChatMessage" discriminator in the payload.
    private const SessionMessageType BroadcastMessageType = SessionMessageType.SyncPlayGroupUpdate;

    private readonly ConcurrentDictionary<string, List<ChatMessage>> _messagesByGroup = new();
    private readonly ISessionManager _sessionManager;
    private readonly ILogger<ChatService> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="ChatService"/> class.
    /// </summary>
    /// <param name="sessionManager">The Jellyfin session manager for WebSocket broadcasts.</param>
    /// <param name="logger">The logger instance.</param>
    public ChatService(ISessionManager sessionManager, ILogger<ChatService> logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
    }

    /// <summary>
    /// Adds a message to a group and broadcasts it to all connected clients via WebSocket.
    /// </summary>
    /// <param name="groupId">The Syncplay group ID.</param>
    /// <param name="userId">The sender's Jellyfin user ID.</param>
    /// <param name="username">The sender's display name.</param>
    /// <param name="content">The message content.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The created <see cref="ChatMessage"/>.</returns>
    public async Task<ChatMessage> AddMessageAsync(
        string groupId,
        string userId,
        string username,
        string content,
        CancellationToken cancellationToken = default)
    {
        var message = new ChatMessage
        {
            UserId = userId,
            Username = username,
            GroupId = groupId,
            Content = content,
            Timestamp = DateTimeOffset.UtcNow
        };

        var groupMessages = _messagesByGroup.GetOrAdd(groupId, _ => new List<ChatMessage>());

        lock (groupMessages)
        {
            groupMessages.Add(message);
            if (groupMessages.Count > MaxMessagesPerGroup)
            {
                groupMessages.RemoveAt(0);
            }
        }

        await BroadcastToAllAsync(message, cancellationToken).ConfigureAwait(false);

        return message;
    }

    /// <summary>
    /// Gets recent messages for a given group.
    /// </summary>
    /// <param name="groupId">The Syncplay group ID.</param>
    /// <param name="count">Maximum number of messages to return.</param>
    /// <returns>List of recent messages, oldest first.</returns>
    public IReadOnlyList<ChatMessage> GetRecentMessages(string groupId, int count = 100)
    {
        if (!_messagesByGroup.TryGetValue(groupId, out var messages))
        {
            return Array.Empty<ChatMessage>();
        }

        lock (messages)
        {
            return messages.TakeLast(count).ToList();
        }
    }

    private async Task BroadcastToAllAsync(ChatMessage message, CancellationToken cancellationToken)
    {
        try
        {
            // Wrap with a discriminator so client.js can identify our messages
            // without colliding with real SyncPlay group updates.
            var envelope = new ChatMessageEnvelope
            {
                SyncPlayChatMessage = message
            };

            var allUserIds = _sessionManager.Sessions
                .Select(s => s.UserId)
                .Distinct()
                .ToList();

            if (allUserIds.Count == 0)
            {
                return;
            }

            await _sessionManager.SendMessageToUserSessions(
                allUserIds,
                BroadcastMessageType,
                envelope,
                cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast chat message for group {GroupId}", message.GroupId);
        }
    }
}

/// <summary>
/// Envelope that wraps a chat message for WebSocket delivery.
/// Client JS detects the presence of "syncplayChatMessage" to distinguish from real SyncPlay updates.
/// </summary>
public class ChatMessageEnvelope
{
    /// <summary>
    /// Gets or sets the chat message payload.
    /// </summary>
    public ChatMessage? SyncPlayChatMessage { get; set; }
}
