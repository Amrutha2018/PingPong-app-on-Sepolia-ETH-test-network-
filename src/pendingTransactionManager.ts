import { AppContext } from "./appContext";
import { ethers } from "ethers";
import {
	saveConfirmedState,
	IState,
} from "./state_managers/confirmedStateManager";
import {
	IPendingEntry,
	moveEntryToCancelled,
	removePendingEntry,
	updatePendingEntry,
} from "./state_managers/pendingStateManager";
import { logger } from "./logger";
import { limiter } from "./main";

const PENDING_LIMIT_MS = 2 * 60_000;
const MAX_ATTEMPTS_RESENDING = 5;

export async function confirmPendingTransactions(): Promise<void> {
	const provider = AppContext.httpProvider;
	const pendingEntries = AppContext.pendingPongs;
	if (!pendingEntries.length) {
		return;
	}

	pendingEntries.sort((a, b) => {
		if (a.blockNumber === b.blockNumber) {
			return a.logIndex - b.logIndex;
		}
		return a.blockNumber - b.blockNumber;
	});

	for (const entry of pendingEntries) {
		const { blockNumber, logIndex, pongTxHash, createdAt, attempts, nonce } =
			entry;
		if (!pongTxHash) {
			continue;
		}

		try {
			const receipt = await limiter.schedule(() =>
				provider.getTransactionReceipt(pongTxHash)
			);
			if (!receipt) {
				// Transaction is pending
				const now = Date.now();
				const pendingTime = now - createdAt;
				if (pendingTime > PENDING_LIMIT_MS) {
					// Transaction pending for more than pending thereshold
					if (attempts < MAX_ATTEMPTS_RESENDING) {
						// More speed up attempts remains
						logger.info(
							`PongTxHash=${pongTxHash} still pending after ${
								pendingTime / 1000
							}s. Attempting speed-up (attempt #${attempts + 1}).`
						);

						const newTxHash = await speedUpTransaction(entry);

						if (newTxHash) {
							updatePendingEntry(blockNumber, logIndex, {
								pongTxHash: newTxHash,
								attempts: attempts + 1,
								createdAt: now,
							});
						} else {
							logger.error(`Failed to speed up txHash=${pongTxHash}`);
						}
					} else {
						// Maximum speed up attempts already done, cancel transaction
						logger.warn(
							`PongTxHash=${pongTxHash} exceeded maxAttempts. Attempting final cancel.`
						);
						const cancelTxHash = await cancelTransaction(entry);
						if (!cancelTxHash) {
							logger.error(
								`Failed to create cancel transaction for nonce=${nonce}`
							);
						} else {
							updatePendingEntry(blockNumber, logIndex, {
								pongTxHash: cancelTxHash,
								canceled: true,
							});
						}
					}
				}
				continue;
			}

			// Failed Transaction
			if (receipt.status === 0) {
				logger.warn(`PongTxHash=${pongTxHash} failed on-chain (status=0).`);
				if (attempts < MAX_ATTEMPTS_RESENDING) {
					// Speed up attempts remains
					const newTxHash = await speedUpTransaction(entry);
					if (newTxHash) {
						updatePendingEntry(blockNumber, logIndex, {
							pongTxHash: newTxHash,
							attempts: attempts + 1,
							createdAt: Date.now(),
						});
					} else {
						logger.error(
							`Failed to re-broadcast PongTxHash=${pongTxHash} after fail`
						);
					}
				} else {
					// Speed up attemps over, cancel transaction
					logger.warn(
						`Max attempts reached for PongTxHash=${pongTxHash}. Canceling...`
					);
					const cancelTxHash = await cancelTransaction(entry);
					if (cancelTxHash)
						moveEntryToCancelled({
							...entry,
							cancelledHash: cancelTxHash,
							canceled: true,
						});
					removePendingEntry(blockNumber, logIndex);
				}
				continue;
			}
			// Transaction successfull
			logger.info(
				`PongTxHash=${pongTxHash} confirmed in block ${receipt.blockNumber}.`
			);

			const { lastProcessedBlock, lastProcessedLogIndex } =
				AppContext.confirmedState;
			if (
				blockNumber > lastProcessedBlock ||
				(blockNumber === lastProcessedBlock && logIndex > lastProcessedLogIndex)
			) {
				AppContext.confirmedState.lastProcessedBlock = blockNumber;
				AppContext.confirmedState.lastProcessedLogIndex = logIndex;
				saveConfirmedState(AppContext.confirmedState as IState);
			}

			removePendingEntry(blockNumber, logIndex);
		} catch (error) {
			logger.error(`Error checking receipt of PongTxHash=${pongTxHash}`, error);
		}
	}
}

export async function speedUpTransaction(
	entry: IPendingEntry
): Promise<string | null> {
	try {
		const wallet = AppContext.wallet;
		const { nonce, pongTxHash } = entry;

		const feeData = await limiter.schedule(() =>
			AppContext.httpProvider.getFeeData()
		);
		let maxFeePerGas = feeData.maxFeePerGas;
		let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
		if (!maxFeePerGas) maxFeePerGas = ethers.parseUnits("5", "gwei");
		if (!maxPriorityFeePerGas)
			maxPriorityFeePerGas = ethers.parseUnits("2", "gwei");

		maxFeePerGas = (maxFeePerGas * 125n) / 100n;
		maxPriorityFeePerGas = (maxPriorityFeePerGas * 125n) / 100n;

		const txResponse = await limiter.schedule(() =>
			AppContext.pingPongContract.pong(pongTxHash, {
				nonce,
				maxFeePerGas,
				maxPriorityFeePerGas,
			})
		);

		logger.info(
			`Speed up: oldTxHash=${entry.pongTxHash}, newTxHash=${txResponse.hash}`
		);
		return txResponse.hash;
	} catch (error) {
		logger.error("speedUpTransaction() error:", error);
		return null;
	}
}

export async function cancelTransaction(
	entry: IPendingEntry
): Promise<string | null> {
	try {
		const wallet = AppContext.wallet;
		const feeData = await limiter.schedule(() =>
			AppContext.httpProvider.getFeeData()
		);
		let maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits("5", "gwei");
		let maxPriorityFeePerGas =
			feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei");

		maxFeePerGas = (maxFeePerGas * 200n) / 100n;
		maxPriorityFeePerGas = (maxPriorityFeePerGas * 200n) / 100n;

		const txResponse = await limiter.schedule(() =>
			wallet.sendTransaction({
				to: wallet.address,
				value: 0,
				nonce: entry.nonce,
				maxFeePerGas,
				maxPriorityFeePerGas,
			})
		);

		logger.info(
			`cancelTransaction: Replacing oldTxHash=${entry.pongTxHash} with cancelTxHash=${txResponse.hash}, nonce=${entry.nonce}`
		);
		return txResponse.hash;
	} catch (error) {
		logger.error("cancelTransaction() error:", error);
		return null;
	}
}
