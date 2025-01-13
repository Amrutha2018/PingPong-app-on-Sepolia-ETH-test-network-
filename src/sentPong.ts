import { Log, TransactionResponse, ethers } from "ethers";
import { AppContext, HTTP_PROVIDER_URL, reCreateWalletAndContract, WEBSOCKET_PROVIDER_URL } from "./appContext";
import {
  unsubscribeFromPingEventsViaWebSocket,
  startPollingFallback,
  stopPollingFallback,
} from "./fallbackPollingManager";
import { addPendingEntry } from "./state_managers/pendingStateManager";
import { logger } from "./logger";
import { limiter } from "./main";

export async function createPongTransaction(
  pingTxHash: string,
  blockNumber: number,
  logIndex: number
) {
  const pingPongContract = AppContext.pingPongContract;
  try {
    logger.info(
      `Sending pong() for Ping txHash=${pingTxHash}, block=${blockNumber}, index=${logIndex}`
    );
    const txResponse: TransactionResponse = await limiter.schedule(() =>
      pingPongContract.pong(pingTxHash)
    );
    addPendingEntry({
      blockNumber,
      logIndex,
      pingTxHash,
      pongTxHash: txResponse.hash,
      createdAt: Date.now(),
      attempts: 0,
      nonce: txResponse.nonce,
      canceled: false,
      cancelledHash: "",
    });
    AppContext.pendingState = {
      lastProcessedBlock: blockNumber,
      lastProcessedLogIndex: logIndex,
    };
  } catch (error) {
    logger.error(
      `Failed to process Ping event at block ${blockNumber}:`,
      error
    );
  }
}

export async function fetchMissedEvents(fromBlock: number): Promise<void> {
  const provider = AppContext.httpProvider;
  const pingTopic = AppContext.topics.ping;

  const toBlock = await provider.getBlockNumber();
  logger.info(
    `Fetching missed Ping events from block ${fromBlock} to ${toBlock}`
  );
  const logs: Log[] = await limiter.schedule(() =>
    provider.getLogs({
      fromBlock,
      toBlock,
      topics: [pingTopic],
      address: AppContext.contractAddress,
    })
  );

  for (const log of logs) {
    const { blockNumber, index: logIndex, topics, transactionHash } = log;

    if (topics[0] !== pingTopic) {
      continue;
    }

    if (
      blockNumber < AppContext.confirmedState.lastProcessedBlock ||
      (blockNumber === AppContext.confirmedState.lastProcessedBlock &&
        logIndex <= AppContext.confirmedState.lastProcessedLogIndex!) ||
      blockNumber < AppContext.pendingState.lastProcessedBlock ||
      (blockNumber === AppContext.pendingState.lastProcessedBlock &&
        logIndex <= AppContext.pendingState.lastProcessedLogIndex!)
    ) {
      continue;
    }

    logger.info(
      `New Ping() detected at block ${blockNumber}, logIndex ${logIndex}`
    );
    await createPongTransaction(transactionHash, blockNumber, logIndex);
  }
}

export function subscribeToPingEvents() {
  const { pingPongContract, confirmedState, pendingState } = AppContext;

  pingPongContract.on("Ping", async (...args) => {
    const event = args[args.length - 1];
    const log = event.log as Log;
    const { blockNumber, transactionHash, index: logIndex } = log;

    try {
      if (
        blockNumber < confirmedState.lastProcessedBlock ||
        (blockNumber === confirmedState.lastProcessedBlock &&
          logIndex <= confirmedState.lastProcessedLogIndex) ||
        blockNumber < pendingState.lastProcessedBlock ||
        (blockNumber === pendingState.lastProcessedBlock &&
          logIndex <= pendingState.lastProcessedLogIndex)
      ) {
        return;
      }

      logger.info(
        `(WebSocket) New Ping() detected at block ${blockNumber}, logIndex ${logIndex}`
      );
      await createPongTransaction(transactionHash, blockNumber, logIndex);
    } catch (error) {
      logger.error(`Error processing Ping event: ${error}`);
    }
  });

  logger.info("Subscribed to Ping() events using Contract instance!");
}

let heartbeatInterval: NodeJS.Timeout | null = null;

export function startWebSocketHeartbeat() {
  const { wsProvider } = AppContext;

  logger.info("(WebSocket) Starting heartbeat...");

  if (!wsProvider) {
    logger.error("(WebSocket) Provider is not initialized for heartbeat.");
    return;
  }

  stopWebSocketHeartbeat();

  heartbeatInterval = setInterval(async () => {
    try {
      logger.info("(WebSocket) Sending heartbeat check...");
      const timeout = 10_000; // 10 seconds
      await Promise.race([
        wsProvider.getBlockNumber(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Heartbeat timeout")), timeout)
        ),
      ]);
      logger.info("(WebSocket) Heartbeat check passed.");
    } catch (error) {
      logger.error("(WebSocket) Heartbeat check failed:", error);
      handleWebSocketFailure();
    }
  }, 300_000); // 5 minutes
}

export function stopWebSocketHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info("(WebSocket) Heartbeat stopped.");
  }
}

export function attachWebSocketErrorHandlers() {
  const { wsProvider } = AppContext;

  wsProvider.addListener("error", (error: Error) => {
    logger.error("(WebSocket) Connection error:", error);
    handleWebSocketFailure();
  });
}

export async function handleWebSocketFailure() {
  try {
    await AppContext.httpProvider.getBlockNumber();
  } catch(error) {
    AppContext.httpProvider = new ethers.JsonRpcProvider(HTTP_PROVIDER_URL)
  }
  reCreateWalletAndContract(AppContext.httpProvider)
  unsubscribeFromPingEventsViaWebSocket();
  stopWebSocketHeartbeat();
  startPollingFallback();
  setTimeout(() => attemptWebSocketReconnection(), 30_000);
}

export async function attemptWebSocketReconnection() {
  logger.info("Attempting WebSocket reconnection...");

  try {
    const webSocketRunning = await reInitializeWebSocketProvider();
    if (webSocketRunning) {
      reCreateWalletAndContract(AppContext.wsProvider)
      subscribeToPingEvents();
      attachWebSocketErrorHandlers();
      startWebSocketHeartbeat();
      stopPollingFallback();
    }
    logger.info(
      "(WebSocket) Reconnected successfully. Resuming real-time event subscription."
    );
  } catch (err) {
    logger.error("WebSocket reconnection failed:", err);
    setTimeout(() => attemptWebSocketReconnection(), 30_000);
  }
}

export async function reInitializeWebSocketProvider() {
  const WS_URL = WEBSOCKET_PROVIDER_URL;
  if (!WS_URL) {
    throw new Error("Websocket URL Missing!");
  }
  const newWsProvider = new ethers.WebSocketProvider(WS_URL);
  try {
    await newWsProvider.getBlockNumber();
  } catch (error) {
    logger.error("Websocket connection still unstable!");
    return false;
  }
  AppContext.wsProvider = newWsProvider;
  logger.info("(WebSocket) New WebSocketProvider successfully created.");
  return true;
}
