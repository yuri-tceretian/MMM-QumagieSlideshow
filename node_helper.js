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
const fs = require("fs").promises;
const path = require("path");

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
	  this.cacheDir = path.join(__dirname, "cache"); // Cache folder in plugin directory
	  this.ensureCacheDir();
  },

	// Ensure cache directory exists
	async ensureCacheDir() {
		try {
			await fs.mkdir(this.cacheDir, { recursive: true });
		} catch (error) {
			console.error("Error creating cache directory:", error);
		}
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

  sendGetRequest(url, callback) {
	  return http.get(url, {
		headers: {
			"x-api-key": this.config.api_key,
		},
	  }, callback)
  },

  getAlbumData() {
    return new Promise((resolve, reject) => {
      const u = new URL(this.config.host)
      u.pathname = "/api/albums/" + this.config.albumId

      this.log(Log.debug, `Sending GET to ${u.toString()}`)
      this.sendGetRequest(u.toString(),  (response) => {
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

  async getAlbumDataAll() {
	  this.albumData = await this.getAlbumData()
	  this.log(Log.info, `Got album ${this.albumData.albumName}. ${this.albumData.assetCount} items.`)
	  this.getNextImage()
  },

  // gathers the image list
  async gatherImageList(config, sendNotification) {
    if (this.loading) {
      this.log(Log.debug, "Already loading")
      return
    }
    this.loading = true
    this.log(Log.info, "Start loading album photos")
    try {
      await this.getAlbumDataAll()
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
    if (!this.albumData.assets || this.albumData.assets.length === 0) {
      this.log(Log.info, "Album has no photos")
      return
    }

    this.stopTimer()

    this.log(Log.info, "Getting the next image")
    let asset = null
    const images = this.albumData.assets
    do {
      const nextImage = Math.floor(Math.random() * images.length)
      asset = images[nextImage]
    } while (this.hasShownBefore(asset) || images.length <= HISTORY_MAX_SIZE)
    this.sendImage(asset)
    this.pushHistory(asset)

    this.restartTimer()
  },

// Check cache or fetch image
	async fetchImage(assetId) {
		const u = new URL(this.config.host)
		u.pathname = "/api/assets/" + assetId + "/thumbnail"
		u.search = querystring.stringify({
			size: "preview"
		})

	  const cacheFile = path.join(this.cacheDir, `${assetId}.b64`);

		// Check if image is in cache
		try {
			const cachedData = await fs.readFile(cacheFile, "utf8");
			this.log(Log.debug, `Serving ${assetId} from file cache`);
			return cachedData;
		} catch (error) {
			if (error.code !== "ENOENT") {
				this.log(Log.error, "Error reading cache:", error);
			}
		}

		// Fetch from Immich API if not in cache
		try {
			const response = await fetch(u, {
				headers: {
					"x-api-key": this.config.api_key,
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status}`);
			}

			const buffer = await response.arrayBuffer();
			const base64Data = Buffer.from(buffer).toString('base64');

// Store in file cache
			await fs.writeFile(cacheFile, base64Data, 'utf8');
			this.log(Log.debug, `Cached ${assetId} to file`);

			return base64Data;
		} catch (error) {
			this.log(Log.error, "Error fetching image:", error);
			this.sendSocketNotification("IMAGE_ERROR", { assetId, error: error.message });
		}
	},


  async sendImage(asset) {
	const data = await this.fetchImage(asset.id)
	  const eventPayload = {
      identifier: this.config.identifier,
      asset: asset,
      url: `data:image/jpeg;base64,${data}`,
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
