/*
    Vincent OS Website, The website of Vincent OS.
    Copyright (C) 2022 - 2024 - v38armageddon

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
    ==========================================================================
    ROTATING DOTTED LEAF (js/leaf.js)
    Only loaded by index.html. Needs the three.js library (loaded just before
    this file) and the <canvas id="leaf-canvas"> on the page.
    The leaf is a curved 3D surface covered with dots. It spins forever.
    Contents:
      1. Start-up checks
      2. Settings                <- speed, shape, dots, camera, tilt, phone size
      3. Colors
      4. Renderer, scene and camera
      5. Dot drawing (shaders: dot size from shading, round dots, color)
      6. Leaf shape (outline, curve, surface direction)
      7. Heavier dots toward the base
      8. Building the dots (blade + stem)
      9. Leaf position and tilt
     10. Resizing (box size, phone mode)
     11. Animation (rotation)
    ==========================================================================
*/

(function () {
    "use strict";


    /* ==========================================================================
       1. START-UP CHECKS
       Stop quietly if the canvas or three.js is missing, or WebGL is not available.
       ========================================================================== */

    var canvas = document.getElementById("leaf-canvas");
    if (!canvas || !window.THREE) {
        return;
    }

    var renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (error) {
        return;
    }


    /* ==========================================================================
       2. SETTINGS
       ========================================================================== */

    /* Rotation */
    var SECONDS_PER_TURN = 20;   /* time for one full 360° turn (lower = faster) */

    /* Leaf shape */
    var LENGTH = 2.6;            /* leaf length */
    var HALF_WIDTH = 0.78;       /* half of the leaf width at its widest point */

    /* Dots */
    var DOT_SPACING = 0.03;      /* distance between dots (lower = more, denser dots) */
    var DOT_SIZE = 0.01;         /* base dot size (keep below DOT_SPACING) */
    var SHADOW_WEIGHT = 2;       /* how much bigger dots get in shaded areas (0 = all the same) */
    var BASE_WEIGHT = 2.2;       /* how much bigger dots are at the bottom of the leaf (1 = no effect) */
    var BASE_FADE = 0.6;         /* how far up the leaf the bigger bottom dots reach (0 to 1) */

    /* Camera and position */
    var CAMERA_DISTANCE = 8;     /* leaf size on wide screens (lower = bigger leaf) */
    var TILT = -0.55;            /* leaf slant on wide screens (0 = upright) */
    var MOBILE_FILL = 0.92;      /* on phones, share of the screen the leaf fills (1 = touches the edges) */


    /* ==========================================================================
       3. COLORS
       ========================================================================== */

    var dotColor = new THREE.Color("#40654e");                       /* dots in the shade */
    var litColor = dotColor.clone().offsetHSL(0, 0.05, 0.12);        /* dots facing the light (a bit brighter) */


    /* ==========================================================================
       4. RENDERER, SCENE AND CAMERA
       ========================================================================== */

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);   /* transparent background */

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);


    /* ==========================================================================
       5. DOT DRAWING (shaders run on the graphics card)
       - Vertex shader: works out each dot's size from its shading
         (shaded = bigger), its angle to the viewer and its distance.
       - Fragment shader: draws each dot as a soft-edged circle, colored
         between dotColor (shade) and litColor (light).
       uLight = direction the light comes from (top right, in front).
       ========================================================================== */

    var dotMaterial = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
            uScale: { value: 1 },
            uShadowWeight: { value: SHADOW_WEIGHT },
            uLight: { value: new THREE.Vector3(0.5, 0.6, 0.65).normalize() },
            uDotColor: { value: dotColor },
            uLitColor: { value: litColor }
        },
        vertexShader: [
            "attribute float size;",
            "uniform float uScale;",
            "uniform float uShadowWeight;",
            "uniform vec3 uLight;",
            "varying float vLight;",
            "void main() {",
            "    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);",
            "    vec3 viewNormal = normalize(normalMatrix * normal);",
            "    vec3 toCamera = normalize(-viewPosition.xyz);",
            "    float facing = dot(viewNormal, toCamera);",
            "    if (facing < 0.0) { viewNormal = -viewNormal; facing = -facing; }",
            "    float light = max(dot(viewNormal, uLight), 0.0);",
            "    float shade = 1.0 - light;",
            "    float weight = (1.0 - uShadowWeight * 0.5) + uShadowWeight * shade;",
            "    float foreshortening = mix(0.45, 1.0, facing);",
            "    vLight = light;",
            "    gl_PointSize = size * weight * foreshortening * uScale / -viewPosition.z;",
            "    gl_Position = projectionMatrix * viewPosition;",
            "}"
        ].join("\n"),
        fragmentShader: [
            "uniform vec3 uDotColor;",
            "uniform vec3 uLitColor;",
            "varying float vLight;",
            "void main() {",
            "    float distanceToCenter = length(gl_PointCoord - 0.5);",
            "    float alpha = 1.0 - smoothstep(0.4, 0.5, distanceToCenter);",
            "    if (alpha < 0.01) discard;",
            "    gl_FragColor = vec4(mix(uDotColor, uLitColor, vLight), alpha);",
            "}"
        ].join("\n")
    });


    /* ==========================================================================
       6. LEAF SHAPE
       Positions on the leaf use two numbers:
         u = along the length (0 = base/stem, 1 = tip)
         v = across the width (-1 = left edge, 0 = center vein, 1 = right edge)
       ========================================================================== */

    /* Half width of the leaf at height u (pointed tip, rounded base) */
    function halfWidthAt(u) {
        return HALF_WIDTH * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.9);
    }

    /* 3D point on the leaf. The z line gives the curve:
       edges curl up, middle arches, tip bends back, small groove along the center vein. */
    function surfacePoint(u, v) {
        var w = halfWidthAt(u);
        var x = v * w;
        var y = (u - 0.5) * LENGTH;
        var z = 0.45 * v * v * w
            + 0.28 * Math.sin(Math.PI * u)
            - 0.35 * Math.pow(u, 3)
            - 0.035 * Math.exp(-Math.pow(x / 0.05, 2));
        return new THREE.Vector3(x, y, z);
    }

    /* Direction the leaf surface faces at a point (used for shading) */
    function surfaceNormal(u, v) {
        var step = 0.002;
        var alongLength = surfacePoint(Math.min(u + step, 1), v).sub(surfacePoint(Math.max(u - step, 0), v));
        var acrossWidth = surfacePoint(u, v + step).sub(surfacePoint(u, v - step));
        return acrossWidth.cross(alongLength).normalize();
    }


    /* ==========================================================================
       7. HEAVIER DOTS TOWARD THE BASE
       Returns BASE_WEIGHT at the base, fading to 1 at BASE_FADE.
       ========================================================================== */

    function baseWeightAt(u) {
        var towardBase = Math.max(0, 1 - u / BASE_FADE);
        return 1 + (BASE_WEIGHT - 1) * towardBase * towardBase;
    }


    /* ==========================================================================
       8. BUILDING THE DOTS
       ========================================================================== */

    function buildDots() {
        var positions = [];
        var normals = [];
        var sizes = [];

        function addDot(point, normal, size) {
            positions.push(point.x, point.y, point.z);
            normals.push(normal.x, normal.y, normal.z);
            sizes.push(size);
        }

        /* ----- Blade: rows of evenly spaced dots, as wide as the leaf at that height ----- */
        var rows = Math.round(LENGTH / DOT_SPACING);
        for (var row = 1; row < rows; row++) {
            var u = row / rows;
            var halfWidth = halfWidthAt(u);
            var count = Math.max(1, Math.round(2 * halfWidth / DOT_SPACING));
            for (var i = 0; i <= count; i++) {
                var v = count === 1 ? 0 : i / count * 2 - 1;
                var side = Math.abs(v);
                /* Slightly bigger dots on the side veins and the center vein */
                var veinPhase = (u - side * 0.32) * 9;
                var vein = Math.pow(Math.max(0, Math.cos(veinPhase * Math.PI * 2)), 8) * (1 - side);
                var midrib = Math.exp(-Math.pow(side * halfWidth / 0.04, 2));
                /* Final size: base size x bottom weight x veins x small random variation (±10%) */
                var size = DOT_SIZE * baseWeightAt(u) * (1 + 0.3 * midrib + 0.15 * vein) * (0.9 + Math.random() * 0.2);
                addDot(surfacePoint(u, v), surfaceNormal(u, v), size);
            }
        }

        /* ----- Stem: a line of dots along a short curve under the base ----- */
        var base = surfacePoint(0, 0);
        var stem = new THREE.CatmullRomCurve3([
            new THREE.Vector3(base.x, base.y + 0.1, base.z),
            new THREE.Vector3(base.x, base.y - 0.15, base.z - 0.02),
            new THREE.Vector3(base.x + 0.06, base.y - 0.45, base.z - 0.1)
        ]);
        var stemDots = Math.round(stem.getLength() / (DOT_SPACING * 0.7));
        for (var s = 0; s <= stemDots; s++) {
            addDot(stem.getPointAt(s / stemDots), new THREE.Vector3(0, 0, 1), DOT_SIZE * BASE_WEIGHT * 0.9);
        }

        /* ----- Hand the dots to three.js ----- */
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

        return new THREE.Points(geometry, dotMaterial);
    }


    /* ==========================================================================
       9. LEAF POSITION AND TILT
       "leaf" holds the tilt; "spinner" turns around the vertical axis.
       ========================================================================== */

    var leaf = new THREE.Group();
    leaf.add(buildDots());
    leaf.position.y = 0.15;
    leaf.rotation.z = TILT;
    leaf.rotation.x = 0.2;

    var spinner = new THREE.Group();
    spinner.add(leaf);
    scene.add(spinner);


    /* ==========================================================================
       10. RESIZING
       Runs when the canvas size changes (the box is set in css/index.css > LEAF).
       Tall boxes (phones): the leaf stands upright and is sized to fill
       MOBILE_FILL of the box. Other boxes: TILT and CAMERA_DISTANCE are used.
       ========================================================================== */

    function resize() {
        var width = canvas.clientWidth;
        var height = canvas.clientHeight;
        if (!width || !height) {
            return;
        }
        renderer.setSize(width, height, false);
        camera.aspect = width / height;

        var viewSlope = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        if (camera.aspect < 0.8) {
            /* Phone mode: upright leaf, camera distance chosen to fit width and height */
            leaf.rotation.z = 0;
            var leafHeight = LENGTH + 0.6;
            var leafWidth = HALF_WIDTH * 2 + 0.1;
            camera.position.z = Math.max(
                leafHeight / (viewSlope * MOBILE_FILL),
                leafWidth / (viewSlope * camera.aspect * MOBILE_FILL)
            );
        } else {
            /* Wide mode */
            leaf.rotation.z = TILT;
            camera.position.z = CAMERA_DISTANCE;
        }

        camera.updateProjectionMatrix();
        /* Keeps dot sizes correct for this box size */
        dotMaterial.uniforms.uScale.value = height * renderer.getPixelRatio() / viewSlope;
    }

    resize();
    if (window.ResizeObserver) {
        new ResizeObserver(resize).observe(canvas);
    } else {
        window.addEventListener("resize", resize);
    }


    /* ==========================================================================
       11. ANIMATION
       Turns the leaf every frame, with a small up-and-down float.
       Drawing pauses while the leaf is scrolled off screen (saves battery);
       the rotation is time-based, so it never looks like it stopped.
       ========================================================================== */

    var visible = true;
    if (window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
        }).observe(canvas);
    }

    var clock = new THREE.Clock();

    function frame() {
        requestAnimationFrame(frame);
        if (!visible) {
            return;
        }
        var time = clock.getElapsedTime();
        spinner.rotation.y = time * Math.PI * 2 / SECONDS_PER_TURN;
        spinner.position.y = Math.sin(time * 0.8) * 0.05;
        renderer.render(scene, camera);
    }

    frame();
})();
