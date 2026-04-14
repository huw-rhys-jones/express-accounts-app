/**
 * mfaState.js
 *
 * Stores the Firebase MultiFactorResolver in module scope so it can be passed
 * between navigation screens without serialising it through route params
 * (it contains non-serialisable functions/objects).
 */

let _resolver = null;

export const setMfaResolver = (resolver) => {
  _resolver = resolver;
};

export const getMfaResolver = () => _resolver;

export const clearMfaResolver = () => {
  _resolver = null;
};
