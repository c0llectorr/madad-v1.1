import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

export interface LeafMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  snippet?: string;
  color?: string;   // pin color, CSS
  icon?: 'pin' | 'dot';
}

export interface LeafPolyline {
  id: string;
  coords: { lat: number; lng: number }[];
  color: string;
  width?: number;
  dashed?: boolean;
}

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #F2F2ED; }
  #map { height: 100%; }
  .madad-pin {
    width: 22px; height: 22px; border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg); border: 2px solid #fff;
    box-shadow: 1px 2px 4px rgba(0,0,0,0.35);
  }
  .madad-dot {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid #fff; box-shadow: 1px 2px 4px rgba(0,0,0,0.35);
  }
  .madad-pin div, .madad-dot div { transform: rotate(45deg); }
  .leaflet-popup-content-wrapper { border-radius: 8px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  var map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([__LAT__, __LNG__], __ZOOM__);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var layers = { markers: L.layerGroup().addTo(map), lines: L.layerGroup().addTo(map) };

  function pinIcon(color, kind) {
    return L.divIcon({
      className: '',
      html: '<div class="' + (kind === 'dot' ? 'madad-dot' : 'madad-pin') +
            '" style="background:' + color + '"></div>',
      iconSize: kind === 'dot' ? [14, 14] : [22, 22],
      iconAnchor: kind === 'dot' ? [7, 7] : [11, 20],
      popupAnchor: [0, -18]
    });
  }

  // Full redraw driven from React — simple and avoids stale-state bugs.
  window.__render = function (payload) {
    layers.markers.clearLayers();
    layers.lines.clearLayers();
    var pts = [];
    (payload.polylines || []).forEach(function (p) {
      var ll = (p.coords || []).map(function (c) { return [c.lat, c.lng]; });
      if (ll.length > 1) {
        L.polyline(ll, {
          color: p.color, weight: p.width || 5,
          dashArray: p.dashed ? '8 8' : null, opacity: 0.9
        }).addTo(layers.lines);
        pts = pts.concat(ll);
      }
    });
    (payload.markers || []).forEach(function (m) {
      var marker = L.marker([m.lat, m.lng], { icon: pinIcon(m.color || '#118AB2', m.icon || 'pin') })
        .bindPopup('<b>' + (m.title || '') + '</b>' + (m.snippet ? '<br>' + m.snippet : ''));
      marker.addTo(layers.markers);
      pts.push([m.lat, m.lng]);
    });
    if (payload.fit && pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: false });
    }
  };

  map.on('click', function (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify(
      { type: 'click', lat: e.latlng.lat, lng: e.latlng.lng }));
  });

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
})();
</script>
</body>
</html>`;

export default function LeafletMap({
  height, markers = [], polylines = [], onMapPress,
  center = { lat: 29.85, lng: 70.45 }, zoom = 9, fit = false,
}: {
  height?: number;
  markers?: LeafMarker[];
  polylines?: LeafPolyline[];
  onMapPress?: (lat: number, lng: number) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  fit?: boolean;
}) {
  const webRef = useRef<WebView>(null);
  const html = useMemo(
    () => HTML.replace('__LAT__', String(center.lat))
              .replace('__LNG__', String(center.lng))
              .replace('__ZOOM__', String(zoom)),
    [center.lat, center.lng, zoom]);

  const payload = useMemo(
    () => `window.__render && window.__render(${JSON.stringify({ markers, polylines, fit })}); true;`,
    [markers, polylines, fit]);

  // Push a redraw whenever markers/polylines change, and once after the page
  // (including the CDN Leaflet scripts, which load synchronously) finishes.
  const inject = useCallback(() => {
    webRef.current?.injectJavaScript(payload);
  }, [payload]);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'click' && onMapPress) onMapPress(msg.lat, msg.lng);
      else if (msg.type === 'ready') inject();
    } catch { /* ignore malformed messages */ }
  }, [onMapPress, inject]);

  const onNavigation = useCallback((req: WebViewNavigation) =>
    req.url.startsWith('about:') || req.url.startsWith('https://unpkg.com') ||
    req.url.startsWith('https://tile.openstreetmap.org'), []);

  return (
    <View style={[styles.wrap, height != null && { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        onLoadEnd={inject}
        onShouldStartLoadWithRequest={onNavigation}
        style={styles.web}
        containerStyle={styles.web}
      />
      <UpdateHook payload={payload} onReady={inject} />
    </View>
  );
}

// Injects on every payload change — a tiny component so the effect re-runs
// exactly when the serialized payload string actually differs.
function UpdateHook({ payload, onReady }: { payload: string; onReady: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onReady, 250); // let the WebView settle after load
    return () => clearTimeout(t);
  }, [payload, onReady]);
  return null;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#F2F2ED' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
