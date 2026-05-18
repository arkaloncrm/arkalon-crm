import { useState, useRef, useEffect, useCallback } from 'react';
import { validationApi } from '../api/validation.js';

// Debounced duplicate check for create/edit forms.
//   entityType   — 'lead' | 'account' | 'contact'
//   buildPayload — () => object of entity-specific fields to check
//   excludeId    — current record id in edit mode (so it doesn't flag itself)
// Returns { matches, check, clear }. `check` is wired to field onBlur handlers
// and fires the API 500ms after the last blur.
export function useDuplicateCheck(entityType, buildPayload, excludeId) {
  const [matches, setMatches] = useState([]);
  const timerRef = useRef(null);
  const payloadRef = useRef(buildPayload);
  payloadRef.current = buildPayload;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const check = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await validationApi.checkDuplicate({
          entity_type: entityType,
          exclude_id: excludeId || undefined,
          ...payloadRef.current(),
        });
        setMatches(res.data.data || []);
      } catch {
        setMatches([]);
      }
    }, 500);
  }, [entityType, excludeId]);

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    setMatches([]);
  }, []);

  return { matches, check, clear };
}
