import type { Uniforms } from '@/components/shader';

export const BAKE_SCALE = 2;
const PAD = 48;
const MARGIN = 400;

const bakeVertexSource = `#version 300 es
precision highp float;
in vec2 coordinates;

uniform vec2 u_bake_view;
uniform vec2 u_bake_margin;

out vec2 fragCoord;

void main(void) {
  gl_Position = vec4(coordinates, 0.0, 1.0);
  fragCoord = (coordinates + 1.0) * 0.5 * u_bake_view;
  fragCoord.y = u_bake_view.y - fragCoord.y;
  fragCoord -= u_bake_margin;
}
`;

type Pass = { data: Uint8Array; width: number; height: number };

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Could not create shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
  }
  return shader;
}

function setUniform(gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, uniform: Uniforms[string]) {
  switch (uniform.type) {
    case 'uniform1f':
      gl.uniform1f(location, uniform.value);
      break;
    case 'uniform3f':
      gl.uniform3f(location, ...uniform.value);
      break;
    case 'uniform4f':
      gl.uniform4f(location, ...uniform.value);
      break;
    case 'uniform1fv':
      gl.uniform1fv(location, uniform.value);
      break;
    case 'uniform3fv':
      gl.uniform3fv(location, uniform.value.flat());
      break;
    case 'uniform1i':
      gl.uniform1i(location, uniform.value);
      break;
  }
}

function renderPass(source: string, uniforms: Uniforms, width: number, height: number): Pass {
  const fullWidth = width + MARGIN * 2;
  const fullHeight = height + MARGIN * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(fullWidth * BAKE_SCALE);
  canvas.height = Math.round(fullHeight * BAKE_SCALE);
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) {
    throw new Error('WebGL2 unavailable');
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, bakeVertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, source));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed');
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const coordinates = gl.getAttribLocation(program, 'coordinates');
  gl.enableVertexAttribArray(coordinates);
  gl.vertexAttribPointer(coordinates, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
  gl.uniform2f(gl.getUniformLocation(program, 'u_bake_view'), fullWidth, fullHeight);
  gl.uniform2f(gl.getUniformLocation(program, 'u_bake_margin'), MARGIN, MARGIN);
  gl.uniform1f(gl.getUniformLocation(program, 'u_time'), 0);
  for (const name in uniforms) {
    setUniform(gl, gl.getUniformLocation(program, name), uniforms[name]);
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const raw = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  const rowBytes = canvas.width * 4;
  const data = new Uint8Array(raw.length);
  for (let y = 0; y < canvas.height; y += 1) {
    data.set(raw.subarray((canvas.height - 1 - y) * rowBytes, (canvas.height - y) * rowBytes), y * rowBytes);
  }
  return { data, width: canvas.width, height: canvas.height };
}

function bounds({ data, width, height }: Pass) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const pad = PAD * BAKE_SCALE;
  const even = (value: number) => value - (value % BAKE_SCALE);
  return {
    x: even(Math.max(0, minX - pad)),
    y: even(Math.max(0, minY - pad)),
    right: even(Math.min(width, maxX + 1 + pad)),
    bottom: even(Math.min(height, maxY + 1 + pad)),
  };
}

function crop({ data, width }: Pass, box: ReturnType<typeof bounds>, pick: number[]) {
  const channels = pick.length;
  const cropWidth = box.right - box.x;
  const cropHeight = box.bottom - box.y;
  const out = new Uint8Array(cropWidth * cropHeight * channels);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const from = ((box.y + y) * width + box.x + x) * 4;
      const to = (y * cropWidth + x) * channels;
      for (let c = 0; c < channels; c += 1) {
        out[to + c] = data[from + pick[c]];
      }
    }
  }
  return { data: out, width: cropWidth, height: cropHeight };
}

async function upload(file: string, image: { data: Uint8Array; width: number; height: number }, channels: number) {
  const params = new URLSearchParams({
    file,
    width: String(image.width),
    height: String(image.height),
    channels: String(channels),
  });
  const response = await fetch(`/api/scene-bake?${params}`, { method: 'POST', body: image.data.slice().buffer });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as { file: string; bytes: number };
}

export async function bakeScene({
  source,
  uniforms,
  width,
  height,
  focus,
  settings,
}: {
  source: string;
  uniforms: Uniforms;
  width: number;
  height: number;
  focus: { x: number; y: number };
  settings: Record<string, number>;
}) {
  const view = { ...uniforms, u_view: { type: 'uniform1i', value: 0 } } as Uniforms;
  const mask = renderPass(source, { ...view, u_bake: { type: 'uniform1i', value: 1 } }, width, height);
  const box = bounds(mask);
  if (box.right <= box.x) {
    throw new Error('Nothing to bake: the mask is empty');
  }
  const surface = renderPass(
    source,
    { ...view, u_bake: { type: 'uniform1i', value: 2 }, u_logo_mix: { type: 'uniform1f', value: 1 } },
    width,
    height,
  );
  const written = [
    await upload('mask.webp', crop(mask, box, [0, 3]), 2),
    await upload('surface.webp', crop(surface, box, [0, 1, 2, 3]), 4),
  ];
  const meta = {
    version: Date.now(),
    scale: BAKE_SCALE,
    width: (box.right - box.x) / BAKE_SCALE,
    height: (box.bottom - box.y) / BAKE_SCALE,
    offsetX: box.x / BAKE_SCALE - MARGIN - focus.x,
    offsetY: box.y / BAKE_SCALE - MARGIN - focus.y,
    settings,
  };
  const response = await fetch('/api/scene-bake?file=meta', { method: 'POST', body: JSON.stringify(meta, null, 2) });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return { meta, written };
}
