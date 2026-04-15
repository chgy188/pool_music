precision highp float;
precision highp int;

#include <utils>

varying vec3 pos;


void main() {
  gl_FragColor = vec4(getWallColor(pos), 1.0);

  vec4 info = texture2D(water, pos.xz / vec2(poolHalfWidth * 2.0, poolHalfDepth * 2.0) + 0.5);

  if (pos.y < info.r) {
    gl_FragColor.rgb *= underwaterColor * 1.5;
  }
}
