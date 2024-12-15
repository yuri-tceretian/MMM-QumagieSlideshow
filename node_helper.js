/*
 * node_helper.js
 *
 * MagicMirror²
 * Module: MMM-QumagieSlideshow
 *
 * MagicMirror² By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-QumagieSlideshow By Yuri Tseretyan
 * MIT Licensed.
 */

// call in the required classes
const NodeHelper = require("node_helper")
const Log = require("../../js/logger.js")
const querystring = require("querystring")
const http = require("http")

const HISTORY_MAX_SIZE = 10

// the main module helper create
module.exports = NodeHelper.create({

  log(fn, msg, ...params) {
    Log.info(`QUMAGIESLIDESHOW: ${msg}`, ...params)
  },
  start() {
    this.loading = false
    this.albumData = null
    this.timer = null
    this.history = []
  },

  hasShownBefore(item) {
    return this.history.some(hist => item === hist)
  },

  pushHistory(item) {
    if (this.history.length >= HISTORY_MAX_SIZE) {
      this.history.shift()
    }
    this.history.push(item)
  },

  popHistory() {
    if (this.history.length === 0) {
      return null
    }
    return this.history.pop()
  },

  getAlbumDataPaged(page = 1, size = 10) {
    return new Promise((resolve, reject) => {
      const u = new URL(this.config.host)
      u.pathname = "/qumagie/p/api/list.php"
      u.search = querystring.stringify({
        a: this.config.albumId,
        t: "allMedia",
        c: size.toString(),
        p: page.toString(),
        s: "time",
        d: "desc"
      })

      this.log(Log.debug, `Sending GET to ${u.toString()}`)
      http.get(u.toString(), (response) => {
        let data = ""
        // A chunk of data has been received.
        response.on("data", (chunk) => {
          data += chunk
        })
        // The whole response has been received. Parse the result.
        response.on("end", () => {
          try {
            const result = JSON.parse(data)
            resolve(result)
          } catch (error) {
            reject(error)
          }
        })
      }).on("error", (error) => {
        reject(error)
      })
    })
  },

  async getAlbumDataAll(page, size, fn) {
    this.log(Log.debug, `Getting page ${page}`)
    const r = await this.getAlbumDataPaged(page, size)
    this.log(Log.debug, `Got ${r.DataList.length} items`)
    const canContine = r.DataList.length === size
    if (this.albumData) {
      this.albumData.DataList = this.albumData.DataList.concat(r.DataList)
    } else {
      this.albumData = r
    }
	  this.log(Log.info, `Got ${r.DataList.length} items. Total: ${this.albumData.DataList.length}`)
  	if (fn) {
      fn(page)
    }
    if (canContine) {
      await this.getAlbumDataAll(page + 1, size, fn)
    }
  },

  // gathers the image list
  async gatherImageList(config, sendNotification) {
    if (this.loading) {
      this.log(Log.debug, "Already loading")
      return
    }
    this.loading = true
    this.log(Log.info, "Start loading album photos")
    const page = 1
    const size = 1000
    try {
      await this.getAlbumDataAll(page, size, (p) => {
        if (p === 1 && sendNotification) {
          this.log(Log.debug, "Sending ready event")
          this.getNextImage()
        }
      })
      this.log(Log.info, "Got all album photos", this.albumData.DataList.length)
    } catch (error) {
      this.log(Log.error, "Failed to load album photos", error)
    } finally {
      this.loading = false
    }
  },

  stopTimer() {
    if (!this.timer) {
      return
    }
    this.log(Log.debug, "Stopping timer")
    const it = this.timer
    this.timer = null
    clearTimeout(it)
  },

  restartTimer() {
    this.stopTimer()
    this.log(Log.debug, "Restarting timer")
    const mod = this
    this.timer = setTimeout(() => {
      mod.getNextImage()
    }, mod.config?.slideshowSpeed || 10000)
  },

  onRegisterConfig(config) {
    // Get the image list in a non-blocking way since large # of images would cause
    // the MagicMirror startup banner to get stuck sometimes.
    this.config = config
    setTimeout(async () => {
      await this.gatherImageList(config, true)
      this.getNextImage()
    }, 200)
  },

  getPreviousImage() {
    const img = this.popHistory()
    if (img === null) {
      this.log(Log.debug, "Cannot get the previous image because history is empty")
      return
    }
    this.log(Log.info, "Getting the previous image")
    this.stopTimer()
    this.sendImage(img)
    this.restartTimer()
  },

  getNextImage() {
    if (!this.albumData) {
      this.log(Log.info, "Album has not loaded yet")
      return
    }
    if (!this.albumData.DataList || this.albumData.DataList.length === 0) {
      this.log(Log.info, "Album has no photos")
      return
    }

    this.stopTimer()

    this.log(Log.info, "Getting the next image")
    let info = null
    const images = this.albumData.DataList
    do {
      const nextImage = Math.floor(Math.random() * images.length)
      info = images[nextImage].FileItem
    } while (this.hasShownBefore(info) || images.length <= HISTORY_MAX_SIZE)
    this.sendImage(info)
    this.pushHistory(info)

    this.restartTimer()
  },

  sendImage(info) {
    const u = new URL(this.config.host)
    u.pathname = "/qumagie/p/api/thumb.php"
    u.search = querystring.stringify({
      m: "display",
      t: "photo",
      ac: info.code,
      f: info.id
    })

    const eventPayload = {
      identifier: this.config.identifier,
      fileInfo: info,
      url: u.toString()
    }

    this.log(Log.debug, "Sending payload", JSON.stringify(eventPayload))
    this.sendSocketNotification(
      "QUMAGIESLIDESHOW_DISPLAY_IMAGE",
      eventPayload
    )
  },

  socketNotificationReceived(notification, payload) {
    this.log(Log.debug, "Got notification", notification)
    switch (notification) {
      case "QUMAGIESLIDESHOW_REGISTER_CONFIG":
        this.onRegisterConfig(payload)
        return
      case "QUMAGIESLIDESHOW_NEXT_IMAGE":
        this.getNextImage()
        return
      case "QUMAGIESLIDESHOW_PREV_IMAGE":
        this.getPreviousImage()
        return
      case "QUMAGIESLIDESHOW_PAUSE":
        this.stopTimer()
        return
      case "QUMAGIESLIDESHOW_PLAY":
        this.restartTimer()
        return
      default:
        Log.debug("Unknown notification. Ignoring", notification)
    }
  }

})
