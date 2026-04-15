const float IOR_AIR = 1.0;
const float IOR_WATER = 1.333;

const vec3 abovewaterColor = vec3(0.35, 1.2, 1.45);
const vec3 underwaterColor = vec3(0.5, 1.1, 1.2);

const float poolHeight = 1.0;

uniform vec3 light;
uniform sampler2D tiles;
uniform sampler2D causticTex;
uniform sampler2D water;
uniform float poolHalfWidth;
uniform float poolHalfDepth;


vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {
  vec3 tMin = (cubeMin - origin) / ray;
  vec3 tMax = (cubeMax - origin) / ray;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}


vec3 getWallColor(vec3 point) {
  float scale = 0.5;

  vec3 wallColor;
  vec3 normal;
  if (abs(point.x) > poolHalfWidth - 0.001) {
    // Left and right walls: use proper UV mapping with repetition
    vec2 wallUV = vec2(
      mod(point.z / poolHalfDepth, 1.0) * 0.5 + 0.25,
      mod(point.y / poolHeight, 1.0) * 0.5 + 0.25
    );
    wallColor = texture2D(tiles, wallUV).rgb;
    normal = vec3(-point.x, 0.0, 0.0);
  } else if (abs(point.z) > poolHalfDepth - 0.001) {
    // Front and back walls: use proper UV mapping with repetition
    vec2 wallUV = vec2(
      mod(point.x / poolHalfWidth, 1.0) * 0.5 + 0.25,
      mod(point.y / poolHeight, 1.0) * 0.5 + 0.25
    );
    wallColor = texture2D(tiles, wallUV).rgb;
    normal = vec3(0.0, 0.0, -point.z);
  } else {
    wallColor = texture2D(tiles, point.xz / vec2(poolHalfWidth * 2.0, poolHalfDepth * 2.0) + 0.5).rgb;
    normal = vec3(0.0, 1.0, 0.0);
  }

  scale = scale / length(point) * 1.3; /* pool ambient occlusion with boost */

  /* caustics */
  vec3 refractedLight = -refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
  float diffuse = max(0.0, dot(refractedLight, normal));
  vec4 info = texture2D(water, point.xz / vec2(poolHalfWidth * 2.0, poolHalfDepth * 2.0) + 0.5);
  if (point.y < info.r) {
    vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) / vec2(poolHalfWidth, poolHalfDepth) * 0.5 + 0.5);
    scale += diffuse * caustic.r * 3.0 * caustic.g;
  } else {
    /* shadow for the rim of the pool */
    vec2 t = intersectCube(point, refractedLight, vec3(-poolHalfWidth, -poolHeight, -poolHalfDepth), vec3(poolHalfWidth, 2.0, poolHalfDepth));
    diffuse *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (point.y + refractedLight.y * t.y - 2.0 / 12.0)));

    scale += diffuse * 1.0;
  }

  return wallColor * scale;
}
