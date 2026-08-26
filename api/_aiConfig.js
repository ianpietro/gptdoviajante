// api/_aiConfig.js — Centralized AI models and business limits config

const FREE_AI_LIMIT = 40;
const PREMIUM_AI_FAIR_USE_LIMIT = 500;

const AI_MODELS = {
  light: process.env.GEMINI_LIGHT_MODEL || 'gemini-2.5-flash-lite',
  primary: process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash',
  fallback: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini'
};
const AI_PRICING_VERSION = process.env.AI_PRICING_VERSION || '2026-08-26-standard';

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// Standard paid-tier prices in USD per 1M tokens. Environment overrides keep
// cost reporting accurate when providers change prices or model aliases.
const AI_PRICING = {
  [AI_MODELS.primary]: {
    inputPerMillion: envNumber('GEMINI_PRIMARY_INPUT_USD_PER_MILLION', 0.30),
    cachedInputPerMillion: envNumber('GEMINI_PRIMARY_CACHED_INPUT_USD_PER_MILLION', 0.03),
    outputPerMillion: envNumber('GEMINI_PRIMARY_OUTPUT_USD_PER_MILLION', 2.50),
    groundingPerRequest: envNumber('GEMINI_GROUNDING_USD_PER_REQUEST', 0.035)
  },
  [AI_MODELS.light]: {
    inputPerMillion: envNumber('GEMINI_LIGHT_INPUT_USD_PER_MILLION', 0.10),
    cachedInputPerMillion: envNumber('GEMINI_LIGHT_CACHED_INPUT_USD_PER_MILLION', 0.01),
    outputPerMillion: envNumber('GEMINI_LIGHT_OUTPUT_USD_PER_MILLION', 0.40),
    groundingPerRequest: envNumber('GEMINI_GROUNDING_USD_PER_REQUEST', 0.035)
  },
  [AI_MODELS.fallback]: {
    inputPerMillion: envNumber('OPENAI_FALLBACK_INPUT_USD_PER_MILLION', 0.15),
    cachedInputPerMillion: envNumber('OPENAI_FALLBACK_CACHED_INPUT_USD_PER_MILLION', 0.075),
    outputPerMillion: envNumber('OPENAI_FALLBACK_OUTPUT_USD_PER_MILLION', 0.60),
    groundingPerRequest: 0
  }
};

module.exports = {
  FREE_AI_LIMIT,
  PREMIUM_AI_FAIR_USE_LIMIT,
  AI_MODELS,
  AI_PRICING,
  AI_PRICING_VERSION
};
