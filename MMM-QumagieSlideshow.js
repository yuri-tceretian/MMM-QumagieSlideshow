/*
 * MMM-QumagieSlideshow.js
 *
 * MagicMirror²
 * Module: MMM-QumagieSlideshow
 *
 * MagicMirror² By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-Slideshow By Yuri Tseretyan
 * MIT Licensed.
 */

Module.register("MMM-QumagieSlideshow", {
  // Default module config.
  defaults: {
    // TODO
    host: "http://localhost:8080",
    // TODO comment + many albums?
    albumId: "o7a2qD",
    // the speed at which to switch between images, in milliseconds
    slideshowSpeed: 10 * 1000,
    // transition speed from one image to the other, transitionImages must be true
    transitionSpeed: "2s",
    // show a progress bar indicating how long till the next image is displayed.
    showProgressBar: false,
    // the sizing of the background image
    // cover: Resize the background image to cover the entire container, even if it has to stretch the image or cut a little bit off one of the edges
    // contain: Resize the background image to make sure the image is fully visible
    backgroundSize: "auto", // cover or contain
    // if backgroundSize contain, determine where to zoom the picture. Towards top, center or bottom
    backgroundPosition: "center", // Most useful options: "top" or "center" or "bottom"
    // transition from one image to the other (may be a bit choppy on slower devices, or if the images are too big)
    transitionImages: false,
    // the gradient to make the text more visible
    gradient: [
      "rgba(0, 0, 0, 0.75) 0%",
      "rgba(0, 0, 0, 0) 40%",
      "rgba(0, 0, 0, 0) 80%",
      "rgba(0, 0, 0, 0.75) 100%"
    ],
    horizontalGradient: [
      "rgba(0, 0, 0, 0.75) 0%",
      "rgba(0, 0, 0, 0) 40%",
      "rgba(0, 0, 0, 0) 80%",
      "rgba(0, 0, 0, 0.75) 100%"
    ],
    radialGradient: [
      "rgba(0,0,0,0) 0%",
      "rgba(0,0,0,0) 75%",
      "rgba(0,0,0,0.25) 100%"
    ],
    // the direction the gradient goes, vertical, horizontal, both or radial
    gradientDirection: "vertical",
    // Whether to scroll larger pictures rather than cut them off
    backgroundAnimationEnabled: false,
    // How long the scrolling animation should take - if this is more than slideshowSpeed, then images do not scroll fully.
    // If it is too fast, then the image may apear gittery. For best result, by default we match this to slideshowSpeed.
    // For now, it is not documented and will default to match slideshowSpeed.
    backgroundAnimationDuration: "1s",
    // How many times to loop the scrolling back and forth.  If the value is set to anything other than infinite, the
    // scrolling will stop at some point since we reuse the same div1.
    // For now, it is not documented and is defaulted to infinite.
    backgroundAnimationLoopCount: "infinite",
    // Transitions to use
    transitions: [
      "opacity",
      "slideFromRight",
      "slideFromLeft",
      "slideFromTop",
      "slideFromBottom",
      "slideFromTopLeft",
      "slideFromTopRight",
      "slideFromBottomLeft",
      "slideFromBottomRight",
      "flipX",
      "flipY"
    ],
    transitionTimingFunction: "cubic-bezier(.17,.67,.35,.96)",
    animations: ["slide", "zoomOut", "zoomIn"],
    changeImageOnResume: false,
    maxWidth: 1920,
    maxHeight: 1080,
  },

  log(msg, ...params) {
    Log.log(`QUMAGIESLIDESHOW: ${msg}`, ...params)
  },

  // load function
  start() {
    // add identifier to the config
    this.config.identifier = this.identifier
    if (!this.config.transitionImages) {
      this.config.transitionSpeed = "0"
    }
    if (this.config.backgroundAnimationDuration === "1s") {
      this.config.backgroundAnimationDuration = `${this.config.slideshowSpeed / 1000}s`
    }
  },

  getScripts() {
    return []
  },

  getStyles() {
    // the css contains the make grayscale code
    return ["MMM-QumagieSlideshow.css"]
  },

  getTranslations() {
    return {
    }
  },

  // Setup receiver for global notifications (other modules etc)
  // Use for example with MMM-Remote-Control API: https://github.com/Jopyth/MMM-Remote-Control/tree/master/API
  // to change image from buttons or curl:
  // curl http://[your ip address]:8080/api/notification/BACKGROUNDSLIDESHOW_PREV or NEXT
  // make sure to set address: "0.0.0.0", and secureEndpoints: false (or setup security according to readme!)
  notificationReceived(notification, payload, sender) {
    switch (notification) {
      case "QUMAGIESLIDESHOW_NEXT_IMAGE":
      case "QUMAGIESLIDESHOW_PREV_IMAGE":
      case "QUMAGIESLIDESHOW_PLAY":
      case "QUMAGIESLIDESHOW_PAUSE":
        this.sendSocketNotification(notification)
        return
      default:
        this.log("Got unknown notification. Ignoring", notification, payload, sender)
    }
  },
  // the socket handler from node_helper.js
  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "QUMAGIESLIDESHOW_READY":
        if (payload.identifier !== this.identifier) {
          return
        }
        this.resume()
        break
      case "QUMAGIESLIDESHOW_DISPLAY_IMAGE":
        if (payload.identifier !== this.identifier) {
          return
        }
        this.displayImage(payload)
        break
      case "QUMAGIESLIDESHOW_REGISTER_CONFIG": {
        // Update config in backend
        this.updateImageList()
        break
      }
      default:
    }
  },

  // Override dom generator.
  getDom() {
    const wrapper = document.createElement("div")
    this.imagesDiv = document.createElement("div")
    this.imagesDiv.className = "images"
    wrapper.appendChild(this.imagesDiv)

    if (
      this.config.gradientDirection === "vertical"
      || this.config.gradientDirection === "both"
    ) {
      this.createGradientDiv("bottom", this.config.gradient, wrapper)
    }

    if (
      this.config.gradientDirection === "horizontal"
      || this.config.gradientDirection === "both"
    ) {
      this.createGradientDiv("right", this.config.horizontalGradient, wrapper)
    }

    if (
      this.config.gradientDirection === "radial"
    ) {
      this.createRadialGradientDiv("ellipse at center", this.config.radialGradient, wrapper)
    }

    if (this.config.showImageInfo) {
      this.imageInfoDiv = this.createImageInfoDiv(wrapper)
    }

    if (this.config.showProgressBar) {
      this.createProgressbarDiv(wrapper, this.config.slideshowSpeed)
    }

    // create an empty image list
    this.imageList = []
    // set beginning image index to 0, as it will auto increment on start
    this.imageIndex = 0
    this.updateImageList()

    return wrapper
  },

  createGradientDiv(direction, gradient, wrapper) {
    const div = document.createElement("div")
    div.style.backgroundImage
      = `linear-gradient( to ${direction}, ${gradient.join()})`
    div.className = "gradient"
    wrapper.appendChild(div)
  },

  createRadialGradientDiv(type, gradient, wrapper) {
    const div = document.createElement("div")
    div.style.backgroundImage
      = `radial-gradient( ${type}, ${gradient.join()})`
    div.className = "gradient"
    wrapper.appendChild(div)
  },

  backgroundSize(imageInfo) {
    if (this.config.backgroundSize === "auto") {
      const w = imageInfo?.fileInfo?.iWidth
      const h = imageInfo?.fileInfo.iHeight
      return h && w && Number(h) < Number(w)
        ? "cover"
        : "contain"
    }
    return this.config.backgroundSize
  },

  createDiv(size) {
    const div = document.createElement("div")
    div.style.backgroundSize = size
    div.style.backgroundPosition = this.config.backgroundPosition
    div.className = "image"
    return div
  },

  createImageInfoDiv(wrapper) {
    const div = document.createElement("div")
    div.className = `info ${this.config.imageInfoLocation}`
    wrapper.appendChild(div)
    return div
  },

  createProgressbarDiv(wrapper, slideshowSpeed) {
    const div = document.createElement("div")
    div.className = "progress"
    const inner = document.createElement("div")
    inner.className = "progress-inner"
    inner.style.display = "none"
    inner.style.animation = `move ${slideshowSpeed}ms linear`
    div.appendChild(inner)
    wrapper.appendChild(div)
  },

  displayImage(imageinfo) {
    this.log("displayImage", imageinfo)
    const image = new Image()
    image.onload = () => {
      // check if there are more than 2 elements and remove the first one
      if (this.imagesDiv.childNodes.length > 1) {
        this.imagesDiv.removeChild(this.imagesDiv.childNodes[0])
      }
      if (this.imagesDiv.childNodes.length > 0) {
        this.imagesDiv.childNodes[0].style.opacity = "0"
      }

      const transitionDiv = document.createElement("div")
      transitionDiv.className = "transition"
      if (this.config.transitionImages && this.config.transitions.length > 0) {
        const randomNumber = Math.floor(Math.random() * this.config.transitions.length)
        transitionDiv.style.animationDuration = this.config.transitionSpeed
        transitionDiv.style.transition = `opacity ${this.config.transitionSpeed} ease-in-out`
        transitionDiv.style.animationName = this.config.transitions[
          randomNumber
        ]
        transitionDiv.style.animationTimingFunction = this.config.transitionTimingFunction
      }

      const imageDiv = this.createDiv(this.backgroundSize(imageinfo))
      imageDiv.style.backgroundImage = `url("${image.src}")`

      if (this.config.showProgressBar) {
        // Restart css animation
        const oldDiv = document.querySelector(".progress-inner")
        const newDiv = oldDiv.cloneNode(true)
        oldDiv.parentNode.replaceChild(newDiv, oldDiv)
        newDiv.style.display = ""
      }

      // Check to see if we need to animate the background
      if (
        this.config.backgroundAnimationEnabled
        && this.config.animations.length
      ) {
        const randomNumber = Math.floor(Math.random() * this.config.animations.length)
        const animation = this.config.animations[randomNumber]
        imageDiv.style.animationDuration = this.config.backgroundAnimationDuration
        imageDiv.style.animationDelay = this.config.transitionSpeed

        if (animation === "slide") {
          // check to see if the width of the picture is larger or the height
          const { width } = image
          const { height } = image
          const adjustedWidth = width * window.innerHeight / height
          const adjustedHeight = height * window.innerWidth / width

          imageDiv.style.backgroundPosition = ""
          imageDiv.style.animationIterationCount = this.config.backgroundAnimationLoopCount
          imageDiv.style.backgroundSize = "cover"

          if (
            adjustedWidth / window.innerWidth
            > adjustedHeight / window.innerHeight
          ) {
            // Scrolling horizontally...
            if (Math.floor(Math.random() * 2)) {
              imageDiv.className += " slideH"
            } else {
              imageDiv.className += " slideHInv"
            }
          } else {
            // Scrolling vertically...
            if (Math.floor(Math.random() * 2)) {
              imageDiv.className += " slideV"
            } else {
              imageDiv.className += " slideVInv"
            }
          }
        } else {
          imageDiv.className += ` ${animation}`
        }
      }
      transitionDiv.appendChild(imageDiv)
      this.imagesDiv.appendChild(transitionDiv)
    }

    image.src = imageinfo.url
  },

  updateImage(backToPreviousImage = false, imageToDisplay = null) {
    if (imageToDisplay) {
      this.displayImage({
        path: imageToDisplay,
        data: imageToDisplay,
        index: 1,
        total: 1
      })
      return
    }

    if (this.imageList.length > 0) {
      this.imageIndex += 1

      if (this.config.randomizeImageOrder) {
        this.imageIndex = Math.floor(Math.random() * this.imageList.length)
      }

      imageToDisplay = this.imageList.splice(this.imageIndex, 1)
      this.displayImage({
        path: imageToDisplay[0],
        data: imageToDisplay[0],
        index: 1,
        total: 1
      })
      return
    }

    if (backToPreviousImage) {
      this.sendSocketNotification("BACKGROUNDSLIDESHOW_PREV_IMAGE")
    } else {
      this.sendSocketNotification("BACKGROUNDSLIDESHOW_NEXT_IMAGE")
    }
  },

  resume() {
    this.suspend()
    const self = this

    if (self.config.changeImageOnResume) {
      self.updateImage()
    }
  },

  updateImageList() {
    this.suspend()
    this.sendSocketNotification(
      "QUMAGIESLIDESHOW_REGISTER_CONFIG",
      this.config
    )
  }
})
