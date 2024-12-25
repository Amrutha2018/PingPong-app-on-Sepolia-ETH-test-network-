import "dotenv/config";
import { AppContext, initializeAppContext } from "./appContext";
import { confirmPendingTransactions } from "./pendingTransactionManager";
import {
	fetchMissedEvents,
	subscribeToPingEvents,
	attachWebSocketErrorHandlers,
} from "./sentPong";
import { logger } from "./logger";
import Bottleneck from "bottleneck";
import {
	testReservoirDepletion,
	testThrottling,
	testWebsocketFallback,
} from "./test";

export const limiter = new Bottleneck({
	reservoir: 12_000_000,
	reservoirRefreshAmount: 12_000_000,
	reservoirRefreshInterval: 30 * 24 * 60 * 60 * 1000,
	minTime: 216,
});

limiter.on("depleted", () => {
	logger.info("Request limit reached. Throttling requests...");
});

async function main() {
	logger.info("Ping Pong App Starting Up...");
	await initializeAppContext();
	await confirmPendingTransactions();
	await fetchMissedEvents(
		AppContext.pendingState.lastProcessedBlock ||
			AppContext.confirmedState.lastProcessedBlock
	);
	subscribeToPingEvents();
	attachWebSocketErrorHandlers();

	setInterval(async () => {
		await confirmPendingTransactions();
	}, 30_000);

	logger.info("Bot initialized!");

	// testWebsocketFallback();

	// testThrottling();

	// testReservoirDepletion();
}

main().catch((err) => {
	logger.error(err);
	logger.info("Application is shutting down...");
	return 0;
});
