function hasUndefinedField(obj: any): boolean {
	if (obj === null || typeof obj !== "object") {
		return obj === undefined;
	}

	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			const value = obj[key];
			if (hasUndefinedField(value)) {
				return true;
			}
		}
	}

	return false;
}
