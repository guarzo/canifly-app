// src/hooks/useAddCharacterCallback.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { log } from "../utils/logger.jsx";
import { finalizelogin } from "../api/apiService.jsx";

/**
 * Custom hook to finalize the "Add Character" flow via OAuth polling.
 *
 * @param {Function} loginRefresh - Function to fetch updated user data
 * (including the newly added character).
 *
 * @returns {Function} startAddCharacterPoll - A function that, when called
 *          with an OAuth `state`, initiates polling to finalize the flow.
 */
export function useAddCharacterCallback(loginRefresh) {
    // Tracks whether we're currently polling.
    const [pollingActive, setPollingActive] = useState(false);

    // Holds the OAuth state we want to finalize.
    const [pollingState, setPollingState] = useState(null);

    // A ref for the "finalized" flag, so it persists across re-renders in the same polling session.
    const finalizedRef = useRef(false);

    useEffect(() => {
        // If we're not active or don't have a state to finalize, do nothing.
        if (!pollingActive || !pollingState) return;

        log(`useAddCharacterCallback: starting poll for state=${pollingState}`);
        let attempts = 0;
        const maxAttempts = 5;

        // DO NOT reset finalizedRef.current here.
        // We do that once in 'startAddCharacterPoll' below.

        const interval = setInterval(async () => {
            attempts++;
            log(`AddChar polling attempt #${attempts}, finalized=${finalizedRef.current}`);

            if (attempts > maxAttempts) {
                console.warn("Gave up after multiple attempts. Clearing interval.");
                // Even if we time out, do a final fetch to see if data came through anyway.
                await loginRefresh();
                clearInterval(interval);
                setPollingActive(false);
                return;
            }

            // If not finalized, attempt to finalize login
            if (!finalizedRef.current) {
                log("Calling finalizelogin for add-character... state:", pollingState);
                const resp = await finalizelogin(pollingState);
                if (resp && resp.success) {
                    // We've successfully finalized on the server, mark as finalized
                    finalizedRef.current = true;
                    log("Finalization on server complete; fetching updated data...");
                    const success = await loginRefresh();
                    if (success) {
                        log("Data fetch success! Clearing interval; new character should be available now.");
                        clearInterval(interval);
                        setPollingActive(false);
                    } else {
                        log("Data fetch not complete yet, continuing to poll...");
                    }
                } else {
                    log("Not ready yet, continuing to poll finalizelogin...");
                }
            } else {
                // Already finalized => keep trying loginRefresh until new data is loaded
                log("Already finalized, retrying loginRefresh...");
                const success = await loginRefresh();
                if (success) {
                    log("Fetched new data, clearing interval.");
                    clearInterval(interval);
                    setPollingActive(false);
                } else {
                    log("Still no new data, continuing to poll...");
                }
            }
        }, 5000);

        // Cleanup function to clear the interval if the component unmounts or we stop polling
        return () => {
            clearInterval(interval);
        };
    }, [pollingActive, pollingState, loginRefresh]);

    return useCallback((state) => {
        log("useAddCharacterCallback -> startAddCharacterPoll called with state:", state);
        // Reset the ref only once when we begin polling
        finalizedRef.current = false;
        setPollingState(state);
        setPollingActive(true);
    }, []);
}
