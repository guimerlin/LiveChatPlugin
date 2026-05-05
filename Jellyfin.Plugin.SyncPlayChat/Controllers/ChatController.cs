using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SyncPlayChat.Models;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Controller.SyncPlay;
using MediaBrowser.Controller.SyncPlay.Requests;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SyncPlayChat.Controllers;

/// <summary>
/// REST API controller for the SyncPlay chat feature.
/// </summary>
[ApiController]
[Route("SyncPlayChat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly ChatService _chatService;
    private readonly ISessionManager _sessionManager;
    private readonly ISyncPlayManager _syncPlayManager;
    private readonly IUserManager _userManager;
    private readonly ILogger<ChatController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="ChatController"/> class.
    /// </summary>
    /// <param name="chatService">The chat service.</param>
    /// <param name="sessionManager">The Jellyfin session manager.</param>
    /// <param name="syncPlayManager">The SyncPlay manager.</param>
    /// <param name="userManager">The user manager.</param>
    /// <param name="logger">The logger.</param>
    public ChatController(
        ChatService chatService,
        ISessionManager sessionManager,
        ISyncPlayManager syncPlayManager,
        IUserManager userManager,
        ILogger<ChatController> logger)
    {
        _chatService = chatService;
        _sessionManager = sessionManager;
        _syncPlayManager = syncPlayManager;
        _userManager = userManager;
        _logger = logger;
    }

    /// <summary>
    /// Returns whether the current user is in a SyncPlay session and the active group ID.
    /// </summary>
    /// <returns>Status object with group information.</returns>
    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<ChatStatusDto> GetStatus()
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return Ok(new ChatStatusDto { InSyncPlayGroup = false });
        }

        var isActive = _syncPlayManager.IsUserActive(userId);
        if (!isActive)
        {
            return Ok(new ChatStatusDto { InSyncPlayGroup = false });
        }

        var session = _sessionManager.Sessions.FirstOrDefault(s => s.UserId == userId);
        string? groupId = null;

        if (session != null)
        {
            try
            {
                var groups = _syncPlayManager.ListGroups(session, new ListGroupsRequest());
                groupId = groups?.FirstOrDefault()?.GroupId.ToString();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not list SyncPlay groups for user {UserId}", userId);
            }
        }

        return Ok(new ChatStatusDto
        {
            InSyncPlayGroup = groupId != null,
            GroupId = groupId
        });
    }

    /// <summary>
    /// Returns recent chat history for a given SyncPlay group.
    /// </summary>
    /// <param name="groupId">The SyncPlay group ID.</param>
    /// <param name="count">Number of messages to return (default 100).</param>
    /// <returns>List of chat messages.</returns>
    [HttpGet("History/{groupId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<ChatMessage>> GetHistory(
        [FromRoute] string groupId,
        [FromQuery] int count = 100)
    {
        var config = Plugin.Instance?.Configuration;
        var maxCount = Math.Min(count, config?.MaxHistoryMessages ?? 100);
        var messages = _chatService.GetRecentMessages(groupId, maxCount);
        return Ok(messages);
    }

    /// <summary>
    /// Sends a chat message to the current SyncPlay group.
    /// </summary>
    /// <param name="request">The message request body.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The created chat message.</returns>
    [HttpPost("Send")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ChatMessage>> SendMessage(
        [FromBody] SendMessageRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request?.Content))
        {
            return BadRequest("Message content cannot be empty.");
        }

        if (request.Content.Length > 500)
        {
            return BadRequest("Message content exceeds 500 characters.");
        }

        var userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return Forbid();
        }

        if (!_syncPlayManager.IsUserActive(userId))
        {
            return BadRequest("You are not in a SyncPlay group.");
        }

        var session = _sessionManager.Sessions.FirstOrDefault(s => s.UserId == userId);
        string? groupId = null;

        if (session != null)
        {
            try
            {
                var groups = _syncPlayManager.ListGroups(session, new ListGroupsRequest());
                groupId = groups?.FirstOrDefault()?.GroupId.ToString();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not list SyncPlay groups for user {UserId}", userId);
            }
        }

        if (groupId == null)
        {
            return BadRequest("Could not determine your SyncPlay group.");
        }

        var user = _userManager.GetUserById(userId);
        var username = user?.Username ?? "Unknown";

        var message = await _chatService.AddMessageAsync(
            groupId,
            userId.ToString(),
            username,
            request.Content,
            cancellationToken).ConfigureAwait(false);

        return Ok(message);
    }

    private Guid GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                         ?? User.FindFirst("Jellyfin-UserId")?.Value
                         ?? User.FindFirst("sub")?.Value;

        return Guid.TryParse(userIdClaim, out var guid) ? guid : Guid.Empty;
    }
}
