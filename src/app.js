/**
 * Main app code
 * 
 * 1. Accept an authorization code as input - this is going to be coming from 
 *    the user when they explicitly grant access for the Twitch integration piece.
 * 1a. TBD - getting the access for the Spotify portion
 * 2. With the authorization code, fetch an OAuth token.  
 * 3. GET the user's channel ID
 * 4. Connect to the channel topic and start subscribing to events
 * 5. On receiving an event, if it's a channel point redemption event, queue
 *    the user input with Spotify (tbd error handling)
 * 
 * TODO: clean up all of this code
 */

const fetch = require("node-fetch");
const WebSocket = require("ws");

// read in credentials
const credentials = require("./credentials.json")

// note: the way this is getting refactored, it assumes that the authorization
//       code already requested these scopes. Leaving this here for 
//       documentation purposes, and as a sanity check on the OAuth token request.
const scopes = "channel_read+channel:read:redemptions";

// note: leaving this here so I don't have to fetch my channel ID all the time.
// const channelId = "106060203"

var oauth;

// connects to Twitch's WSS event stream for channel point redemptions
function subscribeToChannelTopic(channelId) {

    function heartbeat() {
        message = {
            type: "PING",
        };
        console.log("SENT: " + JSON.stringify(message));
        ws.send(JSON.stringify(message));
    }
    var heartbeatInterval = 1000 * 60; //ms between PING's
    var reconnectInterval = 1000 * 3; //ms to wait before reconnect
    var heartbeatHandle;

    ws = new WebSocket("wss://pubsub-edge.twitch.tv");

    ws.onopen = function (event) {
        console.log("INFO: Socket Opened");
        heartbeat();
        heartbeatHandle = setInterval(heartbeat, heartbeatInterval);

        // When the connection is opened, fire a LISTEN event to the WSS
        let listenEvent = {
            type: "LISTEN",
            nonce: "abc123",
            data: {
                topics: [`channel-points-channel-v1.${channelId}`],
                auth_token: oauth.access_token
            },
        };
        ws.send(JSON.stringify(listenEvent));
    };

    ws.onerror = function (error) {
        console.log("ERR: " + JSON.stringify(error));
    };

    ws.onmessage = function (event) {
        // TODO: add Spotify integration here
        message = JSON.parse(event.data);
        console.log({ message });
        if (message.type == "RECONNECT") {
            console.log("INFO: Reconnecting...");
            setTimeout(subscribeToChannelTopic(channelId), reconnectInterval);
        }
    };

    ws.onclose = function () {
        console.log("INFO: Socket Closed");
        clearInterval(heartbeatHandle);
        console.log("INFO: Reconnecting...");
        setTimeout(subscribeToChannelTopic(channelId), reconnectInterval);
    };
}

/**
 * Get the OAuth token, given an authorization code
 * @param {*} clientId 
 * @param {*} clientSecret 
 * @param {*} authorizationCode 
 */
async function retrieveToken(clientId, clientSecret, authorizationCode) {
    let response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=authorization_code&code=${authorizationCode}&redirect_uri=https://github.com/SaxyPandaBear/TwitchSongRequests`, {
        method: "POST",
        mode: "cors"
    });
    return response.json();
}

async function getChannelId(client_id, oauth_token) {
    // note: this uses the deprecated v5 Twitch API
    let response = await fetch("https://api.twitch.tv/kraken/channel", {
        method: "GET",
        mode: "cors",
        headers: {
            "Accept": "application/vnd.twitchtv.v5+json",
            "Client-ID": client_id,
            "Authorization": `OAuth ${oauth_token}`
        }
    });
    return response.json();
}

// TODO: this works locally, but need to figure out how to accept authorization 
//       codes as input server-side. For ease of use/iterations, I am storing
//       a manually fetched authorization code in my credentials file, and referencing
//       it here.
// this fetches the OAuth token, then connects to the WSS.
retrieveToken(credentials.twitch_client_id, credentials.twitch_client_secret, credentials.authorization_code)
    .then((data) => {
        oauth = data;
    })
    .then(() => {
        // GET the channel ID to then feed as input to subscribe to the topic
        getChannelId(credentials.client_id, oauth.access_token).then((channel) => {
            let channelId = channel._id;
            subscribeToChannelTopic(channelId);
        });
    });
