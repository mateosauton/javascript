import { useAuth } from '@clerk/react';
import type { Dispatch } from 'react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import type { SessionTransferError } from './errors';
import { sessionTransferError, toSessionTransferError } from './errors';
import type { SessionTransfer, TransferLease } from './sessionTransfer';
import { acquireTransfer, claimTransfer, resolveTransferRequest } from './sessionTransfer';
import type { NavigationEvent, NavigationVerdict } from './webViewNavigation';
import { judgeNavigation } from './webViewNavigation';

/**
 * Options for `useAuthenticatedWebView`.
 */
export type UseAuthenticatedWebViewParams = {
  /**
   * Absolute URL on one of your instance's domains. It must use HTTPS outside development instances.
   * Changing it prepares a new transfer.
   */
  destination: string;
};

/**
 * Props to spread onto `<WebView>` from `react-native-webview`. They carry the one-time sign-in URL,
 * so never log or store them. If you pass your own `onLoadStart`, `onLoadEnd`, or `onHttpError`,
 * call the matching handler from these props first.
 */
export type AuthenticatedWebViewProps = {
  source: { uri: string };
  onLoadStart: (event: { nativeEvent: { url: string } }) => void;
  onLoadEnd: (event: { nativeEvent: { url: string; code?: number } }) => void;
  onHttpError: (event: { nativeEvent: { url: string } }) => void;
};

/**
 * The state of an authenticated WebView. Keep your loading overlay up while `status` is `preparing`.
 */
export type AuthenticatedWebView =
  | {
      /**
       * The sign-in URL is being prepared, or the WebView is still on Clerk's sign-in page.
       * `webViewProps` is `null` until the URL is ready. Render the WebView under your overlay once it is set.
       */
      status: 'preparing';
      webViewProps: AuthenticatedWebViewProps | null;
      error: null;
      retry: () => void;
    }
  | {
      /**
       * The WebView has left Clerk's sign-in page and shows the destination, signed in.
       */
      status: 'ready';
      webViewProps: AuthenticatedWebViewProps;
      error: null;
      retry: () => void;
    }
  | {
      /**
       * There is no active session in the app, or Clerk reported it signed out.
       */
      status: 'signed-out';
      webViewProps: null;
      error: null;
      retry: () => void;
    }
  | {
      /**
       * Preparing, loading, or redeeming the URL failed. `webViewProps` stays set when the WebView
       * already loaded the URL, so you can keep showing the page it landed on. `retry` prepares a new URL.
       */
      status: 'error';
      webViewProps: AuthenticatedWebViewProps | null;
      error: SessionTransferError;
      retry: () => void;
    };

type TransferState =
  | { phase: 'redeeming'; requestId: string; webViewProps: AuthenticatedWebViewProps }
  | { phase: 'ready'; requestId: string; webViewProps: AuthenticatedWebViewProps }
  | {
      phase: 'failed';
      requestId: string;
      webViewProps: AuthenticatedWebViewProps | null;
      error: SessionTransferError;
    };

type TransferResult =
  | { type: 'minted'; requestId: string; webViewProps: AuthenticatedWebViewProps }
  | { type: 'mint-failed'; requestId: string; error: SessionTransferError };

type TransferAction = TransferResult | { type: 'navigated'; requestId: string; verdict: NavigationVerdict };

function transferReducer(state: TransferState | null, action: TransferAction): TransferState | null {
  switch (action.type) {
    case 'minted':
      return { phase: 'redeeming', requestId: action.requestId, webViewProps: action.webViewProps };
    case 'mint-failed':
      return { phase: 'failed', requestId: action.requestId, webViewProps: null, error: action.error };
    case 'navigated':
      return state?.phase === 'redeeming' && state.requestId === action.requestId
        ? applyVerdict(state, action.verdict)
        : state;
  }
}

function applyVerdict(
  state: Extract<TransferState, { phase: 'redeeming' }>,
  verdict: NavigationVerdict,
): TransferState {
  switch (verdict.kind) {
    case 'pending':
      return state;
    case 'ready':
      return { ...state, phase: 'ready' };
    case 'failed':
      return {
        ...state,
        phase: 'failed',
        error: sessionTransferError(
          verdict.code,
          verdict.code === 'load_failed'
            ? 'The sign-in page failed to load.'
            : 'The web page could not sign the user in.',
        ),
      };
  }
}

/**
 * Prepares a one-time URL that signs the active user in on `destination`, and returns props for a
 * `react-native-webview` `<WebView>` that opens it. The URL is prepared when the hook mounts, so mount it
 * on the screen that shows the WebView. Remounts and React Strict Mode reuse a URL the WebView has not received yet.
 *
 * @param params - The page to open.
 * @returns The WebView state, its props, and a `retry` function.
 *
 * @example
 * ### Show a signed-in web page under a loading overlay
 * ```tsx
 * import { useAuthenticatedWebView } from '@clerk/expo/native-to-web';
 * import { Redirect } from 'expo-router';
 * import { View } from 'react-native';
 * import { WebView } from 'react-native-webview';
 *
 * export default function BillingScreen() {
 *   const web = useAuthenticatedWebView({ destination: 'https://app.example.com/billing' });
 *
 *   if (web.status === 'signed-out') return <Redirect href='/sign-in' />;
 *   if (web.status === 'error' && !web.webViewProps) return <ErrorView onRetry={web.retry} />;
 *
 *   return (
 *     <View style={{ flex: 1 }}>
 *       {web.webViewProps && <WebView {...web.webViewProps} style={{ flex: 1 }} />}
 *       {web.status === 'preparing' && <LoadingOverlay />}
 *     </View>
 *   );
 * }
 * ```
 *
 * @example
 * ### Add your own load handler
 * ```tsx
 * const { webViewProps } = useAuthenticatedWebView({ destination });
 *
 * return (
 *   webViewProps && (
 *     <WebView
 *       {...webViewProps}
 *       onLoadEnd={event => {
 *         webViewProps.onLoadEnd(event);
 *         trackPageLoad(event.nativeEvent.url);
 *       }}
 *     />
 *   )
 * );
 * ```
 */
export function useAuthenticatedWebView({ destination }: UseAuthenticatedWebViewParams): AuthenticatedWebView {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, dispatch] = useReducer(transferReducer, null);
  const settledRequestId = useRef<string | null>(null);
  const requestId = isLoaded && isSignedIn && sessionId ? `${sessionId}\n${destination}\n${attempt}` : null;

  useEffect(() => {
    if (!requestId || settledRequestId.current === requestId) {
      return;
    }

    let attached = true;
    const settle = (result: TransferResult) => {
      if (attached) {
        settledRequestId.current = requestId;
        dispatch(result);
      }
    };
    const fail = (error: unknown) => settle({ type: 'mint-failed', requestId, error: toSessionTransferError(error) });

    let lease: TransferLease;
    try {
      lease = acquireTransfer(resolveTransferRequest({ destination, presentation: 'webview' }));
    } catch (error) {
      fail(error);
      return;
    }

    lease.transfer.then(transfer => {
      if (attached) {
        claimTransfer(lease);
        settle({ type: 'minted', requestId, webViewProps: createWebViewProps(requestId, transfer, dispatch) });
      }
    }, fail);

    return () => {
      attached = false;
    };
  }, [requestId, destination]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  if (!isLoaded) {
    return { status: 'preparing', webViewProps: null, error: null, retry };
  }
  if (!isSignedIn) {
    return { status: 'signed-out', webViewProps: null, error: null, retry };
  }

  const current = state?.requestId === requestId ? state : null;
  switch (current?.phase) {
    case undefined:
      return { status: 'preparing', webViewProps: null, error: null, retry };
    case 'redeeming':
      return { status: 'preparing', webViewProps: current.webViewProps, error: null, retry };
    case 'ready':
      return { status: 'ready', webViewProps: current.webViewProps, error: null, retry };
    case 'failed':
      return current.error.code === 'signed_out'
        ? { status: 'signed-out', webViewProps: null, error: null, retry }
        : { status: 'error', webViewProps: current.webViewProps, error: current.error, retry };
  }
}

function createWebViewProps(
  requestId: string,
  transfer: SessionTransfer,
  dispatch: Dispatch<TransferAction>,
): AuthenticatedWebViewProps {
  const judge = (event: NavigationEvent) =>
    dispatch({ type: 'navigated', requestId, verdict: judgeNavigation(transfer.url, event) });

  return {
    source: { uri: transfer.url },
    onLoadStart: ({ nativeEvent }) => judge({ kind: 'load-start', url: nativeEvent.url }),
    onLoadEnd: ({ nativeEvent }) =>
      judge({ kind: 'load-end', url: nativeEvent.url, failed: typeof nativeEvent.code === 'number' }),
    onHttpError: ({ nativeEvent }) => judge({ kind: 'http-error', url: nativeEvent.url }),
  };
}
