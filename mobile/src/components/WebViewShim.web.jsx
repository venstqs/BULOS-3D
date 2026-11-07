import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/** In a phone browser there is no WebView, so the same 3D page runs in a same-origin frame. */
export const WebView = forwardRef(function WebView({ source, onLoadEnd, onMessage }, ref) {
  const frame = useRef(null);
  useImperativeHandle(ref, () => ({
    injectJavaScript: (js) => { try { frame.current?.contentWindow?.eval(js); } catch { /* the page is still loading */ } },
  }), []);
  useEffect(() => {
    const on = (e) => {
      if (e.source === frame.current?.contentWindow && typeof e.data === 'string') onMessage?.({ nativeEvent: { data: e.data } });
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [onMessage]);
  return <iframe ref={frame} src={source.uri} title="Bulos 3D map" onLoad={onLoadEnd} style={{ border: 0, width: '100%', height: '100%' }} />;
});
