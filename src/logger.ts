import { createLogger, format, transports } from "winston";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const startDate = new Date();
const logFileName = `ping-pong-bot-logs_${formatDateTime(startDate)}.log`;

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

export const logger = createLogger({
	level: LOG_LEVEL.toLowerCase(),
	format: format.combine(
		format.errors({ stack: true }),
		format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		format.printf((info) => {
			const stack = info.stack ? `\n${info.stack}` : ""; // Include stack if present
			return `[${info.timestamp}] [${info.level.toUpperCase()}]: ${
				info.message
			}${stack}`;
		})
	),
	transports: [
		new transports.File({
			filename: path.join(logsDir, logFileName),
		}),
		new transports.Console(),
	],
});

function formatDateTime(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}
