import { AppContext } from "./appContext";
import { logger } from "./logger";
import { fetchMissedEvents } from "./sentPong";

let pollingIntervalId: NodeJS.Timeout | null = null;
let isPollingActive = false;

export function unsubscribeFromPingEventsViaWebSocket() {
	const { pingPongContract } = AppContext;
	pingPongContract.removeAllListeners("Ping");
	logger.info("Removed all WebSocket-based listeners for Ping()");
}

export function startPollingFallback() {
	if (isPollingActive) return;
	isPollingActive = true;

	const { confirmedState: state } = AppContext;
	pollingIntervalId = setInterval(async () => {
		try {
			logger.info("(Polling) Checking for missed Ping() events...");
			await fetchMissedEvents(state.lastProcessedBlock);
		} catch (error) {
			logger.error("(Polling) Error while fetching missed events:", error);
		}
	}, 20_000);

	logger.info("Started fallback polling mode.");
}

export function stopPollingFallback() {
	if (pollingIntervalId) {
		clearInterval(pollingIntervalId);
		pollingIntervalId = null;
	}
	isPollingActive = false;
	logger.info("Stopped fallback polling mode.");
}
