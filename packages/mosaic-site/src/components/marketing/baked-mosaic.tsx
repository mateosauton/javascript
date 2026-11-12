'use client';
import * as React from 'react';

import bake from '@/components/marketing/mosaic-bake.json';
import {
  BAKE_EDGE_MAX,
  FALLBACK_PALETTE,
  type Palette,
  readPalette,
  useSceneLayout,
} from '@/components/marketing/mosaic-shared';
import { Shader, type Uniforms } from '@/components/shader';
import { type Mode, useMode } from '@/components/use-mode';

export const MOSAIC_MASK_URL = `/mosaic/mask.webp?v=${bake.version}`;
export const MOSAIC_SURFACE_URL = `/mosaic/surface.webp?v=${bake.version}`;

const TEXTURES = [MOSAIC_SURFACE_URL, MOSAIC_MASK_URL];
const neverRedraw = () => false;

const source = `#version 300 es
precision highp float;

in vec2 fragCoord;
out vec4 outColor;

uniform mediump vec2 u_resolution;
uniform sampler2D u_texture_0;
uniform sampler2D u_texture_1;

uniform float u_origin_x;
uniform float u_origin_y;
uniform float u_scene_w;
uniform float u_center_x;
uniform float u_center_y;
uniform float u_zoom;
uniform vec3 u_tile_low;
uniform vec3 u_tile_high;
uniform vec3 u_logo_low;
uniform vec3 u_logo_high;
uniform vec3 u_page_color;
uniform float u_logo_mix;
uniform float u_base_mix;
uniform float u_depth;
uniform float u_depth_reach;
uniform float u_light_x;
uniform float u_light_y;
uniform float u_light_z;
uniform float u_camera;
uniform float u_diffuse;
uniform float u_shadow;
uniform float u_specular;
uniform float u_spec_size;
uniform float u_fresnel;
uniform float u_fresnel_power;
uniform float u_rim;
uniform float u_prism;
uniform float u_prism_width;
uniform float u_prism_spread;
uniform float u_prism_side;
uniform float u_shadow_strength;
uniform float u_shadow_height;
uniform float u_shadow_soft;

const float TAU = 6.28318530718;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float EDGE_MAX = ${BAKE_EDGE_MAX}.0;

float edgeAt(vec2 point) {
  return clamp(texture(u_texture_0, point / u_resolution).a * 2.0 - 1.0, 0.0, 1.0);
}

float occluderAt(vec2 point) {
  vec2 uv = point / u_resolution;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return 0.0;
  }
  float edge = clamp(texture(u_texture_0, uv).a * 2.0 - 1.0, 0.0, 1.0) * EDGE_MAX;
  return smoothstep(-0.5, max(u_shadow_soft, 0.5), edge) * texture(u_texture_1, uv).a;
}

void main() {
  vec2 uv = fragCoord / u_resolution;
  vec4 surfaceData = texture(u_texture_0, uv);
  float alpha = texture(u_texture_1, uv).a;
  vec2 scene = fragCoord + vec2(u_origin_x, u_origin_y);
  vec3 toLight = normalize(vec3(u_light_x * u_scene_w, -u_light_y, u_light_z) - vec3(scene, 0.0));
  vec3 color = vec3(0.0);

  if (alpha > 0.0) {
    vec2 nxy = surfaceData.rg * 2.0 - 1.0;
    vec3 surface = normalize(vec3(nxy, sqrt(max(1.0 - dot(nxy, nxy), 0.0))));
    float packed = floor(surfaceData.b * 255.0 + 0.5);
    float isLogo = step(127.5, packed);
    float tone = clamp((packed - isLogo * 145.0) / 110.0, 0.0, 1.0);
    float edge = clamp(surfaceData.a * 2.0 - 1.0, 0.0, 1.0) * EDGE_MAX;

    vec3 tile = mix(u_tile_low, u_tile_high, tone);
    vec3 logoTile = mix(u_logo_low, u_logo_high, tone);
    vec3 tinted = mix(mix(tile, logoTile, isLogo * u_logo_mix), u_page_color, u_base_mix);
    float thick = smoothstep(0.0, max(u_depth_reach, 0.001), edge) * 0.925;
    vec3 deep = tinted * 0.78;
    vec3 thin = mix(tinted, vec3(dot(tinted, LUMA)), 0.5) * 1.35;
    vec3 albedo = mix(tinted, mix(thin, deep, thick), u_depth);

    vec3 toEye = normalize(vec3(vec2(u_center_x, u_center_y) - scene, max(u_camera, 1.0)));
    float lit = u_diffuse * (max(dot(surface, toLight), 0.0) - max(toLight.z, 0.0));
    float shade = 1.0 + (lit < 0.0 ? lit * u_shadow : lit);
    vec3 halfway = normalize(toLight + toEye);
    float spread = acos(clamp(dot(surface, halfway), -1.0, 1.0)) / max(radians(u_spec_size), 0.001);
    float glint = exp(-spread * spread) * u_specular;
    float facing = clamp(dot(surface, toEye), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, u_fresnel_power) * u_fresnel;
    vec3 reflected = reflect(-toEye, surface);
    float sky = mix(1.0 - u_rim, 1.0, smoothstep(0.0, 0.6, -reflected.y));
    color = albedo * shade + vec3(glint + fresnel * sky);

    if (u_prism > 0.0) {
      float across = clamp(edge / max(u_prism_width, 0.5), 0.0, 1.0);
      vec2 inward = vec2(edgeAt(fragCoord + vec2(1.0, 0.0)) - edgeAt(fragCoord - vec2(1.0, 0.0)), edgeAt(fragCoord + vec2(0.0, 1.0)) - edgeAt(fragCoord - vec2(0.0, 1.0)));
      float away = clamp(dot(normalize(inward + 0.00001), normalize(toLight.xy + 0.0001)), 0.0, 1.0);
      float side = mix(away * away, 1.0, u_prism_side);
      float band = 4.0 * across * (1.0 - across);
      vec3 spectrum = 0.5 + 0.5 * cos(TAU * (across * u_prism_spread + vec3(0.0, 0.33, 0.67)));
      float weight = band * side * u_prism;
      color += (spectrum - vec3(dot(spectrum, vec3(0.333)))) * weight + spectrum * weight * 0.25;
    }
  }

  float shadow = 0.0;
  if (u_shadow_strength > 0.0 && alpha < 1.0) {
    vec2 reach = toLight.xy / max(toLight.z, 0.05) * u_shadow_height;
    shadow = occluderAt(fragCoord + reach) * u_shadow_strength;
  }

  outColor = vec4(color * alpha, alpha + shadow * (1.0 - alpha));
}
`;

function buildUniforms(
  palette: Palette,
  mode: Mode,
  origin: [number, number],
  center: [number, number],
  sceneWidth: number,
): Uniforms {
  const s = bake.settings as Record<string, number>;
  const light = mode === 'light';
  const f = (value: number) => ({ type: 'uniform1f', value }) as const;
  const v = (value: [number, number, number]) => ({ type: 'uniform3f', value }) as const;
  return {
    u_origin_x: f(origin[0]),
    u_origin_y: f(origin[1]),
    u_center_x: f(center[0]),
    u_center_y: f(center[1]),
    u_scene_w: f(sceneWidth),
    u_zoom: f(s.zoom),
    u_tile_low: v(palette.tileLow),
    u_tile_high: v(palette.tileHigh),
    u_logo_low: v(palette.logoLow),
    u_logo_high: v(palette.logoHigh),
    u_page_color: v(palette.page),
    u_logo_mix: f(s.logoMix),
    u_base_mix: f(light ? s.lmBase : s.dmBase),
    u_depth: f(s.depth * (light ? s.lmDepth : 1)),
    u_depth_reach: f(s.depthReach),
    u_light_x: f(s.lightX),
    u_light_y: f(s.lightY),
    u_light_z: f(s.lightZ),
    u_camera: f(s.camera),
    u_diffuse: f(s.diffuse),
    u_shadow: f(light ? s.lmShadow : 1),
    u_specular: f(s.specular),
    u_spec_size: f(s.specSize),
    u_fresnel: f(s.fresnel),
    u_fresnel_power: f(s.fresnelPower),
    u_rim: f(s.rim),
    u_prism: f(s.prism),
    u_prism_width: f(s.prismWidth),
    u_prism_spread: f(s.prismSpread),
    u_prism_side: f(s.prismSide),
    u_shadow_strength: f(s.shadowStrength * (light ? 1 : s.dmShadow)),
    u_shadow_height: f(s.shadowHeight),
    u_shadow_soft: f(s.shadowSoft),
  };
}

export function BakedMosaic() {
  const sceneRef = React.useRef<HTMLDivElement>(null);
  const { height, focus, width } = useSceneLayout(sceneRef);
  const mode = useMode();
  const palette = React.useMemo(() => readPalette(mode) ?? FALLBACK_PALETTE, [mode]);
  const settings = bake.settings as Record<string, number>;
  const origin: [number, number] = [focus.x + bake.offsetX, focus.y + bake.offsetY];
  const center: [number, number] = [focus.x, focus.y + settings.logoSize * settings.logoY];
  const uniforms = React.useMemo(
    () => buildUniforms(palette, mode, origin, center, width),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [palette, mode, origin[0], origin[1], center[0], center[1], width],
  );
  return (
    <div
      ref={sceneRef}
      aria-hidden='true'
      className='pointer-events-none absolute left-1/2 top-0 -z-10 h-[38rem] w-[min(96rem,100%)] -translate-x-1/2'
      style={height ? { height } : undefined}
    >
      {height ? (
        <div
          className='absolute'
          style={{ left: origin[0], top: origin[1], width: bake.width, height: bake.height }}
        >
          <Shader
            source={source}
            uniforms={uniforms}
            textures={TEXTURES}
            shouldRender={neverRedraw}
            premultiplied
          />
        </div>
      ) : null}
    </div>
  );
}
