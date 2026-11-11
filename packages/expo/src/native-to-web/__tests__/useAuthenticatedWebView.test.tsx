import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useAuthenticatedWebView } from '../useAuthenticatedWebView';

const mocks = vi.hoisted(() => {
  return {
    auth: { isLoaded: true, isSignedIn: true as boolean, sessionId: 'sess_0' as string | null },
    getClerkInstance: vi.fn(),
    request: vi.fn(),
  };
});

vi.mock('@clerk/react', () => {
  return {
    useAuth: () => mocks.auth,
  };
});

vi.mock('react-native', () => {
  return {
    Platform: { OS: 'ios' },
  };
});

vi.mock('../../provider/singleton', () => {
  return {
    getClerkInstance: mocks.getClerkInstance,
  };
});

const DESTINATION = 'https://app.example.com/billing';
const TRANSFER_URL = 'https://clerk.example.com/v1/session_transfers/redeem?token=one-time';

type MintResponse = ReturnType<typeof mintedResponse>;

function mintedResponse(url = TRANSFER_URL) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    payload: { response: { object: 'session_transfer', url, expires_at: Date.now() + 60_000 } },
  };
}

function refusal(status: number, code: string) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    payload: { errors: [{ code, message: code, long_message: `Refused with ${code}`, meta: {} }] },
  };
}

function deferredMint() {
  let resolve: (response: MintResponse) => void = () => {};
  const response = new Promise<MintResponse>(r => {
    resolve = r;
  });
  mocks.request.mockReturnValueOnce(response);
  return {
    deliver: async (url?: string) => {
      resolve(mintedResponse(url));
      await response;
    },
  };
}

function strictMode({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

function renderWebView(destination = DESTINATION, wrapper?: (props: { children: ReactNode }) => ReactNode) {
  return renderHook((props: { destination: string }) => useAuthenticatedWebView(props), {
    initialProps: { destination },
    wrapper,
  });
}

let sessionCount = 0;

describe('useAuthenticatedWebView', () => {
  beforeEach(() => {
    sessionCount += 1;
    const sessionId = `sess_${sessionCount}`;
    mocks.auth = { isLoaded: true, isSignedIn: true, sessionId };
    mocks.request.mockReset();
    mocks.getClerkInstance.mockReset();
    mocks.getClerkInstance.mockImplementation(() => ({
      loaded: true,
      session: mocks.auth.sessionId ? { id: mocks.auth.sessionId } : null,
      getFapiClient: () => ({ request: mocks.request }),
    }));
  });

  test('mints once under Strict Mode and hands the URL to the WebView', async () => {
    mocks.request.mockResolvedValue(mintedResponse());

    const { result } = renderWebView(DESTINATION, strictMode);

    expect(result.current).toMatchObject({ status: 'preparing', webViewProps: null, error: null });
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());
    expect(result.current.status).toBe('preparing');
    expect(result.current.webViewProps?.source).toEqual({ uri: TRANSFER_URL });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ body: { redirectUrl: DESTINATION, presentationMode: 'webview' } }),
    );
  });

  test('reuses the pending mint when the screen remounts before it arrives', async () => {
    const mint = deferredMint();

    const first = renderWebView();
    first.unmount();
    const second = renderWebView();
    await act(() => mint.deliver());

    expect(second.result.current.webViewProps?.source).toEqual({ uri: TRANSFER_URL });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  test('mints a new URL when the screen remounts after the WebView received one', async () => {
    mocks.request
      .mockResolvedValueOnce(mintedResponse())
      .mockResolvedValueOnce(mintedResponse('https://clerk.example.com/v1/session_transfers/redeem?token=second'));

    const first = renderWebView();
    await waitFor(() => expect(first.result.current.webViewProps).not.toBeNull());
    first.unmount();
    const second = renderWebView();

    await waitFor(() =>
      expect(second.result.current.webViewProps?.source.uri).toBe(
        'https://clerk.example.com/v1/session_transfers/redeem?token=second',
      ),
    );
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  test('reports ready once the WebView finishes loading past the sign-in page', async () => {
    mocks.request.mockResolvedValue(mintedResponse());
    const { result } = renderWebView();
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());
    const props = result.current.webViewProps;

    act(() => props?.onLoadStart({ nativeEvent: { url: TRANSFER_URL } }));
    act(() => props?.onLoadEnd({ nativeEvent: { url: TRANSFER_URL } }));
    expect(result.current.status).toBe('preparing');

    act(() => props?.onLoadEnd({ nativeEvent: { url: DESTINATION } }));
    expect(result.current).toMatchObject({ status: 'ready', webViewProps: props, error: null });

    act(() => props?.onLoadStart({ nativeEvent: { url: `${DESTINATION}?__clerk_error_code=expired` } }));
    expect(result.current.status).toBe('ready');
  });

  test('keeps the WebView props when redeeming fails', async () => {
    mocks.request.mockResolvedValue(mintedResponse());
    const { result } = renderWebView();
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());
    const props = result.current.webViewProps;

    act(() =>
      props?.onLoadStart({
        nativeEvent: { url: `${DESTINATION}?__clerk_status=failed&__clerk_error_code=already_used` },
      }),
    );

    expect(result.current).toMatchObject({
      status: 'error',
      webViewProps: props,
      error: { name: 'SessionTransferError', code: 'already_used' },
    });
    expect(result.current.error?.message).not.toContain('one-time');
  });

  test('reports load_failed when the sign-in page returns an HTTP error', async () => {
    mocks.request.mockResolvedValue(mintedResponse());
    const { result } = renderWebView();
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());

    act(() => result.current.webViewProps?.onHttpError({ nativeEvent: { url: TRANSFER_URL } }));

    expect(result.current).toMatchObject({ status: 'error', error: { code: 'load_failed' } });
    expect(result.current.webViewProps).not.toBeNull();
  });

  test('reports load_failed when the WebView fails to load', async () => {
    mocks.request.mockResolvedValue(mintedResponse());
    const { result } = renderWebView();
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());

    act(() => result.current.webViewProps?.onLoadEnd({ nativeEvent: { url: TRANSFER_URL, code: -1009 } }));

    expect(result.current).toMatchObject({ status: 'error', error: { code: 'load_failed' } });
  });

  test('retry mints a new URL after a failed mint', async () => {
    mocks.request.mockResolvedValueOnce(refusal(403, 'feature_not_enabled')).mockResolvedValueOnce(mintedResponse());
    const { result } = renderWebView();

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ webViewProps: null, error: { code: 'feature_not_enabled' } });

    act(() => result.current.retry());
    expect(result.current).toMatchObject({ status: 'preparing', webViewProps: null });

    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  test('retry after a redeem failure replaces the WebView props', async () => {
    mocks.request
      .mockResolvedValueOnce(mintedResponse())
      .mockResolvedValueOnce(mintedResponse('https://clerk.example.com/v1/session_transfers/redeem?token=second'));
    const { result } = renderWebView();
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());
    act(() =>
      result.current.webViewProps?.onLoadStart({ nativeEvent: { url: `${DESTINATION}?__clerk_error_code=expired` } }),
    );
    const failedProps = result.current.webViewProps;

    act(() => result.current.retry());

    await waitFor(() =>
      expect(result.current.webViewProps?.source.uri).toBe(
        'https://clerk.example.com/v1/session_transfers/redeem?token=second',
      ),
    );
    expect(result.current.status).toBe('preparing');
    act(() => failedProps?.onLoadEnd({ nativeEvent: { url: DESTINATION } }));
    expect(result.current.status).toBe('preparing');
  });

  test('a destination change mints for the new destination and drops the old result', async () => {
    const oldMint = deferredMint();
    mocks.request.mockResolvedValueOnce(
      mintedResponse('https://clerk.example.com/v1/session_transfers/redeem?token=new'),
    );
    const { result, rerender } = renderWebView();

    rerender({ destination: 'https://app.example.com/settings' });
    expect(result.current).toMatchObject({ status: 'preparing', webViewProps: null });
    await waitFor(() =>
      expect(result.current.webViewProps?.source.uri).toBe(
        'https://clerk.example.com/v1/session_transfers/redeem?token=new',
      ),
    );
    await act(() => oldMint.deliver());

    expect(result.current.webViewProps?.source.uri).toBe(
      'https://clerk.example.com/v1/session_transfers/redeem?token=new',
    );
    expect(mocks.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: { redirectUrl: 'https://app.example.com/settings', presentationMode: 'webview' },
      }),
    );
  });

  test('reports signed-out without minting when there is no session', () => {
    mocks.auth = { isLoaded: true, isSignedIn: false, sessionId: null };

    const { result } = renderWebView();

    expect(result.current).toMatchObject({ status: 'signed-out', webViewProps: null, error: null });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  test('reports signed-out when the user signs out after the URL was prepared', async () => {
    mocks.request.mockResolvedValue(mintedResponse());
    const { result, rerender } = renderWebView();
    await waitFor(() => expect(result.current.webViewProps).not.toBeNull());

    mocks.auth = { isLoaded: true, isSignedIn: false, sessionId: null };
    rerender({ destination: DESTINATION });

    expect(result.current).toMatchObject({ status: 'signed-out', webViewProps: null });
  });

  test('reports signed-out when Clerk refuses the mint as signed out', async () => {
    mocks.request.mockResolvedValue(refusal(401, 'signed_out'));

    const { result } = renderWebView();

    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  test('waits without minting until Clerk loads', () => {
    mocks.auth = { isLoaded: false, isSignedIn: false, sessionId: null };

    const { result } = renderWebView();

    expect(result.current).toMatchObject({ status: 'preparing', webViewProps: null });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  test('reports invalid_destination without minting', async () => {
    const { result } = renderWebView('/billing');

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.code).toBe('invalid_destination');
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
