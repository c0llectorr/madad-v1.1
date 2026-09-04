import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

export interface LeafMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  snippet?: string;
  color?: string;   // pin color, CSS
  icon?: 'pin' | 'dot';
  label?: string;   // single character shown inside the pin
}

export interface LeafPolygon {
  id: string;
  coords: { lat: number; lng: number }[];
  color: string;
  fillOpacity?: number;
  dashed?: boolean;
}

export interface LeafPolyline {
  id: string;
  coords: { lat: number; lng: number }[];
  color: string;
  width?: number;
  dashed?: boolean;
}

export interface LeafletMapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitAll: () => void;
}

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #F2F2ED; }
  #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
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
  .madad-pin-label {
    width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg); border: 2.5px solid #fff;
    box-shadow: 1px 2px 5px rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
  }
  .madad-pin-label span {
    transform: rotate(45deg);
    color: #fff; font-size: 11px; font-weight: 700;
    font-family: sans-serif; line-height: 1;
    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  }
  .leaflet-popup-content-wrapper { border-radius: 8px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  var map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
  }).setView([__LAT__, __LNG__], __ZOOM__);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    noWrap: true,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  var layers = { markers: L.layerGroup().addTo(map), lines: L.layerGroup().addTo(map) };
  var allPts = [];

  function pinIcon(color, kind, label) {
    if (label) {
      return L.divIcon({
        className: '',
        html: '<div class="madad-pin-label" style="background:' + color + '">' +
              '<span>' + label + '</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 26],
        popupAnchor: [0, -24]
      });
    }
    return L.divIcon({
      className: '',
      html: '<div class="' + (kind === 'dot' ? 'madad-dot' : 'madad-pin') +
            '" style="background:' + color + '"></div>',
      iconSize: kind === 'dot' ? [14, 14] : [22, 22],
      iconAnchor: kind === 'dot' ? [7, 7] : [11, 20],
      popupAnchor: [0, -18]
    });
  }

  // Called by React after the container is laid out — ensures Leaflet
  // recalculates the tile grid for the actual pixel dimensions.
  window.__invalidate = function () {
    map.invalidateSize({ animate: false });
  };

  // Full redraw driven from React.
  window.__render = function (payload) {
    layers.markers.clearLayers();
    layers.lines.clearLayers();
    if (layers.areas) layers.areas.clearLayers();
    layers.areas = L.layerGroup().addTo(map);
    var pts = [];
    (payload.polygons || []).forEach(function (pg) {
      var ll = (pg.coords || []).map(function (c) { return [c.lat, c.lng]; });
      if (ll.length >= 3) {
        L.polygon(ll, {
          color: pg.color, weight: 2, dashArray: pg.dashed ? '6 6' : null,
          fillColor: pg.color, fillOpacity: pg.fillOpacity != null ? pg.fillOpacity : 0.15
        }).addTo(layers.areas);
      }
    });
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
      var marker = L.marker([m.lat, m.lng], { icon: pinIcon(m.color || '#118AB2', m.icon || 'pin', m.label || '') })
        .bindPopup('<b>' + (m.title || '') + '</b>' + (m.snippet ? '<br>' + m.snippet : ''));
      marker.addTo(layers.markers);
      pts.push([m.lat, m.lng]);
    });
    allPts = pts;
    if (payload.fit && pts.length >= 1) {
      if (pts.length === 1) {
        map.setView(pts[0], 13, { animate: false });
      } else {
        map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: false, maxZoom: 14 });
      }
    }
  };

  window.__flyTo = function (lat, lng, zoom) {
    map.setView([lat, lng], zoom || 13, { animate: true });
  };

  window.__fitAll = function () {
    if (allPts.length === 0) return;
    if (allPts.length === 1) {
      map.setView(allPts[0], 13, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(allPts).pad(0.2), { animate: true, maxZoom: 14 });
    }
  };

  function sendTap(lat, lng) {
    window.ReactNativeWebView.postMessage(JSON.stringify(
      { type: 'click', lat: lat, lng: lng }));
  }
  map.on('click', function (e) { sendTap(e.latlng.lat, e.latlng.lng); });
  // Long-press also flags — survives Android WebView tap-detection quirks
  map.on('contextmenu', function (e) { sendTap(e.latlng.lat, e.latlng.lng); });

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
})();
</script>
</body>
</html>`;

const LeafletMap = React.forwardRef<LeafletMapHandle, {
  height?: number;
  markers?: LeafMarker[];
  polylines?: LeafPolyline[];
  polygons?: LeafPolygon[];
  onMapPress?: (lat: number, lng: number) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  fit?: boolean;
}>(function LeafletMap({
  height, markers = [], polylines = [], polygons = [], onMapPress,
  center = { lat: 29.85, lng: 70.45 }, zoom = 9, fit = false,
}, ref) {
  const webRef = useRef<WebView>(null);

  const html = useMemo(
    () => HTML.replace('__LAT__', String(center.lat))
              .replace('__LNG__', String(center.lng))
              .replace('__ZOOM__', String(zoom)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);   // HTML is fixed at mount — center/zoom are only the initial view

  const payload = useMemo(
    () => `window.__render && window.__render(${JSON.stringify({ markers, polylines, polygons, fit })}); true;`,
    [markers, polylines, polygons, fit]);

  // Track readiness so a center prop set before the map engine loads is
  // applied as soon as (re)inject runs — e.g. a prefilled geocoded location.
  const readyRef = useRef(false);
  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const inject = useCallback(() => {
    // Invalidate + render markers. Camera is NOT touched here — re-injects
    // happen on every data change and must not yank the view back.
    webRef.current?.injectJavaScript(
      `window.__invalidate && window.__invalidate(); ` +
      `window.__render && window.__render(${JSON.stringify({ markers, polylines, polygons, fit })}); true;`
    );
  }, [markers, polylines, polygons, fit]);

  // Re-center whenever the caller changes center after mount (geocode results).
  React.useEffect(() => {
    if (readyRef.current) {
      webRef.current?.injectJavaScript(
        `window.__flyTo && window.__flyTo(${center.lat}, ${center.lng}, ${zoom}); true;`
      );
    }
  }, [center.lat, center.lng, zoom]);

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, z = 13) {
      webRef.current?.injectJavaScript(
        `window.__flyTo && window.__flyTo(${lat}, ${lng}, ${z}); true;`
      );
    },
    fitAll() {
      webRef.current?.injectJavaScript(`window.__fitAll && window.__fitAll(); true;`);
    },
  }), []);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'click' && onMapPress) onMapPress(msg.lat, msg.lng);
      else if (msg.type === 'ready') {
        const first = !readyRef.current;
        readyRef.current = true;
        inject();
        if (first) {
          const c = centerRef.current;
          webRef.current?.injectJavaScript(
            `window.__flyTo && window.__flyTo(${c.lat}, ${c.lng}, ${zoomRef.current}); true;`
          );
        }
      }
    } catch { /* ignore malformed messages */ }
  }, [onMapPress, inject]);

  const onNavigation = useCallback((req: WebViewNavigation) =>
    req.url.startsWith('about:') || req.url.startsWith('https://unpkg.com') ||
    req.url.startsWith('https://tile.openstreetmap.org'), []);

  return (
    <View style={[styles.wrap, height != null ? { height } : { flex: 1 }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        onMessage={onMessage}
        onLoadEnd={inject}
        onShouldStartLoadWithRequest={onNavigation}
        style={styles.web}
        containerStyle={styles.web}
      />
      <UpdateHook payload={payload} onReady={inject} />
    </View>
  );
});

export default LeafletMap;

// Re-injects whenever markers/polylines change, with a small debounce
// to let the WebView settle after navigation/layout changes.
function UpdateHook({ payload, onReady }: { payload: string; onReady: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onReady, 300);
    return () => clearTimeout(t);
  }, [payload, onReady]);
  return null;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#F2F2ED' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
