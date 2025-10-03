# Task K. Bot Syncing

Wallet Address \- 0x0E29f7B68a8af15F16acD772e0b081a470de0ED6  
Starting Block \- 7386018  

## High-Level Flow

* Starting Block:  
  * I choose a specific block number on the **sepolia** network to begin monitoring.  
  * From that block onwards, the bot listens for **Ping()** from the contract.  
* Listening for **Ping():**  
  * The bot uses either a WebSocket subscription or polling (as a fallback) to detect new **Ping()** events.  
  * Whenever a **Ping()** occurs, I extract the transaction hash that triggered the event.  
* Sending **Pong()**:  
  * Right after detecting a **Pong()**, the bot sends a **Pong()** transaction back to the same contract.  
  * It includes the **Ping()** event transaction hash as a parameter, so the contract knows which ping is being answered.  
* Avoiding Double Responses:  
  * I keep track of last processed block and pending blocks number along with log Index at which **Ping()** event came in a json file.  
  * If the bot is restarted, it looks st the stored data and won’t reprocess old pings or miss any new ones.  
* Reliability:  
  * If there’s a network outage, a crash, or I redeploy the bot, it restarts from the last saved block.  
  * That way, it picks up right after it left off without missing or duplicating **Ping()** events.

## Tackling Potential Challenges

* Network or Provider issues  
  * RPC provider might go down or I might lose WebSocket connectivity  
    * I have implemented a fallback polling if WebSocket fails.   
    * The bot stores last processed event so it can reconnect and keep going.  
* Missed or Duplicate Events  
  * If the bot crashes mid-response, there can be duplication or missing of **Ping()** events  
    * I store the last processed block and pending blocks I have sent **Ping()** already in a json.  
    * On restarts only responds to events above this checkpoint.  
* Transaction Getting Stuck  
  * Gas spike may cause my transaction to stay pending.  
    * I speed up or retry if a transaction doesn’t get confirmed within a certain time.  
    * I mark events as fully processed only when the transaction is mined.  
* Rate Limiting  
  * Sending too many requests or transactions could exhaust daily/monthly limits on a free-tier provider.  
    * Only send one **Pong()** per **Ping()**  
    * Throttle if I see too many pings at once.  
* Long-Running Stability  
  * The task requires keeping the Bot up continuously.  
    * I run the bot on an aws ec2 instance which has high stability, using docker to auto-restart on crashes.  
    * Persistent store is stored on disk, so I won’t lose data on restarts.  
* Websocket Silently Closing  
  * Added heartbeat checking for WebSocket.  
    * If heartbeat fails, recreate the websocket.
