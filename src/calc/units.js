// Перевод единиц. 1 Ки = 3,7e10 Бк (определение кюри), 1 км² = 1e6 м² → 1 Ки/км² = 37 кБк/м².

/** @param {number} ciPerKm2 плотность загрязнения, Ки/км² @returns {number} кБк/м² */
export const ciKm2ToKBqM2 = (ciPerKm2) => ciPerKm2 * 37;

/** @param {number} kBqPerM2 @returns {number} Ки/км² */
export const kBqM2ToCiKm2 = (kBqPerM2) => kBqPerM2 / 37;

/** @param {number} sv @returns {number} мкЗв */
export const svToMicroSv = (sv) => sv * 1e6;
