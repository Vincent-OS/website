/*
    ==========================================================================
    MAIN SCRIPT (js/main.js)
    Loaded by every page. Each part only runs if its element is on the page.
    Contents:
      0. Settings                 <- slide time, parallax speed, swipe distance
      1. Mobile menu              (the "Menu" button in the header)
      2. Sliders                  (catalog bands and gallery: autoplay, arrows, swipe)
      3. Band buttons highlight   (sticky Casual/Gaming/Admin buttons, if present)
      4. Footer year
      5. Empty links              (links with href="" do nothing)
      6. Parallax background      (layer sizes and scroll movement)
    ==========================================================================
*/

(function () {
    "use strict";


    /* ==========================================================================
       0. SETTINGS
       ========================================================================== */

    var SECONDS_PER_SLIDE = 7;    /* how long each slide stays on screen */
    var SWIPE_DISTANCE = 50;      /* finger movement (pixels) needed to swipe a slide on phones */
    var PARALLAX_SPEED = 0.25;    /* parallax strength: nearest layer moves this many px per px scrolled */


    /* ==========================================================================
       1. MOBILE MENU
       HTML: <button data-menu-toggle> in the header.
       Opens/closes the link list on phones (CSS: main.css > PHONES).
       ========================================================================== */

    document.querySelectorAll("[data-menu-toggle]").forEach(function (button) {
        var nav = document.getElementById(button.getAttribute("aria-controls"));

        function setOpen(open) {
            button.setAttribute("aria-expanded", String(open));
            nav.classList.toggle("is-open", open);
        }

        /* Click on "Menu": open or close */
        button.addEventListener("click", function () {
            setOpen(button.getAttribute("aria-expanded") !== "true");
        });

        /* Click on a link: close the menu */
        nav.addEventListener("click", function (event) {
            if (event.target.closest("a")) {
                setOpen(false);
            }
        });

        /* Escape key: close the menu */
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                setOpen(false);
            }
        });
    });


    /* ==========================================================================
       2. SLIDERS (catalog bands and gallery)
       HTML: any element with data-slider, containing:
         - <figure data-slide> slides (image + figcaption text)
         - <button data-prev> / <button data-next> arrows
         - an element with data-caption where the slide text is shown
       Slides change every SECONDS_PER_SLIDE seconds, loop forever,
       pause while the mouse is over the slider, and can be swiped on phones.
       ========================================================================== */

    document.querySelectorAll("[data-slider]").forEach(function (slider) {
        var slides = Array.prototype.slice.call(slider.querySelectorAll("[data-slide]"));
        var caption = slider.querySelector("[data-caption]");
        var current = -1;
        var touchStartX = null;
        var timer = null;
        var paused = false;

        if (!slides.length) {
            return;
        }

        /* ----- Copy a slide's text into the caption area -----
           Elements are cloned (not re-read as HTML), so no code can be injected. */
        function copyCaption(slide) {
            var text = slide.querySelector("figcaption");
            while (caption.firstChild) {
                caption.removeChild(caption.firstChild);
            }
            if (text) {
                Array.prototype.forEach.call(text.childNodes, function (node) {
                    caption.appendChild(node.cloneNode(true));
                });
            }
            caption.classList.remove("is-changing");
            caption.getBoundingClientRect();
            caption.classList.add("is-changing");
        }

        /* ----- Show a slide -----
           index: slide number. direction: 1 = comes from the right, -1 = from the left. */
        function show(index, direction) {
            var next = (index + slides.length) % slides.length;
            if (next === current) {
                return;
            }
            var incoming = slides[next];
            var outgoing = slides[current];

            /* Place the new slide on the correct side, then slide both */
            if (outgoing && direction) {
                incoming.style.transition = "none";
                incoming.style.transform = "translateX(" + direction * 100 + "%)";
                incoming.getBoundingClientRect();
                incoming.style.transition = "";
                incoming.style.transform = "";
                outgoing.style.transform = "translateX(" + -direction * 100 + "%)";
            }

            /* Mark which slide is on screen */
            slides.forEach(function (slide, i) {
                var active = i === next;
                slide.classList.toggle("is-active", active);
                slide.setAttribute("aria-hidden", String(!active));
            });
            current = next;

            if (caption) {
                copyCaption(incoming);
            }
            restart();
        }

        /* ----- Autoplay timer (restarts after every change) ----- */
        function restart() {
            clearTimeout(timer);
            if (!paused && slides.length > 1) {
                timer = setTimeout(function () {
                    show(current + 1, 1);
                }, SECONDS_PER_SLIDE * 1000);
            }
        }

        function setPaused(value) {
            paused = value;
            restart();
        }

        /* ----- Pause while the mouse is over the slider ----- */
        slider.addEventListener("mouseenter", function () {
            setPaused(true);
        });

        slider.addEventListener("mouseleave", function () {
            setPaused(false);
        });

        /* ----- Arrows ----- */
        var previousButton = slider.querySelector("[data-prev]");
        var nextButton = slider.querySelector("[data-next]");

        if (previousButton) {
            previousButton.addEventListener("click", function () {
                show(current - 1, -1);
            });
        }

        if (nextButton) {
            nextButton.addEventListener("click", function () {
                show(current + 1, 1);
            });
        }

        /* ----- Swipe on phones ----- */
        slider.addEventListener("touchstart", function (event) {
            touchStartX = event.touches[0].clientX;
        }, { passive: true });

        slider.addEventListener("touchend", function (event) {
            if (touchStartX === null) {
                return;
            }
            var distance = event.changedTouches[0].clientX - touchStartX;
            if (Math.abs(distance) > SWIPE_DISTANCE) {
                var step = distance < 0 ? 1 : -1;
                show(current + step, step);
            }
            touchStartX = null;
        });

        /* Start on the first slide */
        show(0);
    });


    /* ==========================================================================
       3. BAND BUTTONS HIGHLIGHT
       HTML: <nav data-band-nav> with links to #band-... (currently not on the page).
       Turns the button of the band in the middle of the screen green.
       ========================================================================== */

    document.querySelectorAll("[data-band-nav]").forEach(function (nav) {
        var links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
        var bands = links.map(function (link) {
            return document.getElementById(link.getAttribute("href").slice(1));
        });

        function highlight(band) {
            links.forEach(function (link, i) {
                if (bands[i] === band) {
                    link.setAttribute("aria-current", "true");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        }

        /* Watch which band crosses the middle of the screen */
        if (window.IntersectionObserver) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        highlight(entry.target);
                    }
                });
            }, { rootMargin: "-45% 0px -45% 0px" });
            bands.forEach(function (band) {
                if (band) {
                    observer.observe(band);
                }
            });
        }

        highlight(bands[0]);
    });


    /* ==========================================================================
       4. FOOTER YEAR
       HTML: <span data-year> in the footer gets the current year.
       ========================================================================== */

    document.querySelectorAll("[data-year]").forEach(function (element) {
        element.textContent = String(new Date().getFullYear());
    });


    /* ==========================================================================
       5. EMPTY LINKS
       Links with href="" (not filled in yet) do nothing when clicked.
       ========================================================================== */

    document.addEventListener("click", function (event) {
        var link = event.target.closest("a[href='']");
        if (link) {
            event.preventDefault();
        }
    });


    /* ==========================================================================
       6. PARALLAX BACKGROUND
       HTML: <div data-parallax> with layers that have data-depth (0 to 1).
       - fit():  sizes each layer image so it covers the whole screen, even
                 when the layer has moved up at the bottom of the page.
       - move(): moves each layer up when scrolling:
                 scroll distance x PARALLAX_SPEED x data-depth.
       ========================================================================== */

    document.querySelectorAll("[data-parallax]").forEach(function (parallax) {
        var layers = Array.prototype.slice.call(parallax.querySelectorAll("[data-depth]"));
        var waiting = false;

        function depthOf(layer) {
            return parseFloat(layer.getAttribute("data-depth")) || 0;
        }

        /* ----- Size the layer images ----- */
        function fit() {
            var viewWidth = parallax.clientWidth;
            var viewHeight = parallax.clientHeight;
            var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

            layers.forEach(function (layer) {
                var image = layer.querySelector("img");
                if (!image || !image.naturalWidth || !image.naturalHeight) {
                    return;
                }
                /* How far this layer will move at the bottom of the page (+4px safety) */
                var travel = maxScroll * PARALLAX_SPEED * depthOf(layer) + 4;
                /* Big enough to cover the width, and the height plus the travel above and below */
                var scale = Math.max(viewWidth / image.naturalWidth, (viewHeight + 2 * travel) / image.naturalHeight);
                var width = image.naturalWidth * scale;
                var height = image.naturalHeight * scale;
                /* Centered on the screen */
                image.style.width = width + "px";
                image.style.height = height + "px";
                image.style.left = (viewWidth - width) / 2 + "px";
                image.style.top = (viewHeight - height) / 2 + "px";
            });
        }

        /* ----- Move the layers ----- */
        function move() {
            waiting = false;
            var scrolled = window.scrollY;
            layers.forEach(function (layer) {
                var shift = -scrolled * PARALLAX_SPEED * depthOf(layer);
                layer.style.transform = "translate3d(0, " + shift.toFixed(1) + "px, 0)";
            });
        }

        /* Scroll: move once per screen refresh */
        window.addEventListener("scroll", function () {
            if (!waiting) {
                waiting = true;
                requestAnimationFrame(move);
            }
        }, { passive: true });

        /* Re-fit when the window, the page height or an image changes */
        window.addEventListener("resize", fit);
        window.addEventListener("load", fit);
        if (window.ResizeObserver) {
            new ResizeObserver(fit).observe(document.body);
        }
        layers.forEach(function (layer) {
            var image = layer.querySelector("img");
            if (image) {
                image.addEventListener("load", fit);
            }
        });

        fit();
        move();
    });
})();
