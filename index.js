const modules = require('./modules')

const defaults = {
	name: 'YouPorn',
	prefix: 'myouporn_',
	host: 'youporn',
	icon: 'https://blog.youporn.com/wp-content/uploads/2012/02/youporn-logo.png'
}

var url = {
    catalog: page => {
        return 'http://www.metaporn.com/tube/' + defaults.host + '/' + (page || 1)
    },
    search: (query, start, limit) => {
        return 'https://www.pornmd.com/straight/' + encodeURIComponent(query) + '?source=' + defaults.host + '&start=' + (start || 0) + '&ajax=true&limit=' + (limit || 24) + '&format=json'
    }
}

function pornMetaObj(el, url, oldId) {
	let img = el.thumb || el.thumbnail
	if (img)
		img = modules.get.internal.proxy.addProxy(img, { headers: { referer: img } })
    return {
        backgroundShape: 'contain',
        id: oldId || (defaults.prefix + '_' + (url || el.url).replace(':', '|')),
        name: modules.get.ent.decode(el.fulltitle || el.title || ' '),
        poster: img,
        posterShape: 'landscape',
        background: img,
        genre: [ 'Porn' ],
        isFree: 1,
        type: 'tv'
    }
}

function normalizeTime(duration) {
    if (parseInt(duration).toString() == duration) {
        return parseInt(duration)
    } else {
        let timeParts = duration.trim().split(' ').reverse()
        let total = parseInt(timeParts[0])
        timeParts.shift()
        let amplifier = 60
        timeParts.forEach(el => {
            total += parseInt(el) * amplifier
            amplifier *= amplifier
        })
        return total
    }
}

function normalizeResults(proxy, res) {
    return res.map(el => {

    	let img
    	if (el.thumb)
    		img = (el.thumb.startsWith('\/\/') ? 'http:' : '') + el.thumb

        return {
            id: el.id || el.video_id,
            title: el.title,
            type: 'tv',
            thumb: img || null,
            duration: normalizeTime(el.duration),
            url: (el.url ? 'http://www.metaporn.com' + el.url : 'https://www.pornmd.com' + el.link).split('\/').join('/'),
            tags: []
        }
//      (el.related || el.keywords).forEach(tag => { newRes[newRes.length -1].tags.push(tag.name) })
    })
}

let videoQueue

function setVideoQueue() {
	if (!videoQueue) {
		const namedQueue = modules.get['named-queue']
		videoQueue = new namedQueue((task, cb) => {
		    var video = modules.get['youtube-dl'](task.id, ['-j'])

		    video.on('error', err => {
		        cb(err || new Error(defaults.name + ' - Youtube-dl Error: Could Not Parse'))
		    })

		    video.on('info', info => {
		        if (info.url || info.formats)
		            cb(null, info)
		        else
		            cb(new Error('Youtube-dl Error: No URL in Response'))
		    })
		}, Infinity)
	}
	return true
}

function IsJsonString(str) { try { str = JSON.parse(str) } catch (e) { return false }; return str }

module.exports = {
	manifest: local => {
		modules.set(local.modules)
		setVideoQueue()
		return Promise.resolve({
			id: 'org.' + defaults.name.toLowerCase().replace(/[^a-z]+/g,''),
			version: '1.0.0',
			name: defaults.name,
			description: 'Porn videos from ' + defaults.name,
			resources: ['meta', 'stream', 'catalog'],
			types: ['tv'],
			idPrefixes: [defaults.prefix],
			icon: defaults.icon,
			catalogs: [
				{
					id: defaults.prefix + 'catalog',
					type: 'tv',
					name: defaults.name,
					extra: [{ name: 'search' }, { name: 'skip' }]
				}
			]
		})
	},
	handler: (args, local) => {
		modules.set(local.modules)
		setVideoQueue()
		return new Promise((resolve, reject) => {

			const persist = local.persist
			const config = local.config
			const proxy = modules.get.internal.proxy
			const extra = args.extra || {}

		    if (!args.id) {
		        reject(new Error(defaults.name + ' - No ID Specified'))
		        return
		    }

		    if (args.resource == 'catalog') {
		        if (extra && extra.search) {
			        const limit = 24
			        modules.get.needle.get(url.search(extra.search, 0, limit), (err, resp, res) => {
			            if (res && res.videos && res.videos.length)
			            	resolve({ metas: normalizeResults(proxy, res.videos).map(el => pornMetaObj(el)) })
			            else reject(defaults.name + ' - No Response Body 2')
			        })
		        } else {

		            const skip = parseInt(extra.skip || 0)
		            const limit = 96
		            const page = skip / limit + 1

		            modules.get.needle.get(url.catalog(page), { follow_max: 5 }, (err, resp, res) => {
		            	res = IsJsonString(res)
		                if (res && res.videos && res.videos.length)
		                    resolve({ metas: normalizeResults(proxy, res.videos).map(el => pornMetaObj(el)) })
		                else reject(defaults.name + ' - No Response Body 1')
		            })

		        }

		    } else if (args.resource == 'meta') {
		        var metaUrl = args.id.replace(defaults.prefix + '_', '').replace('|', ':')
		        videoQueue.push({ id: metaUrl }, (err, resp) => {
		        	if (!err && resp)
			            resolve({ meta: pornMetaObj(resp, null, args.id) })
		        	else
		        		reject(defaults.name + ' - Could not get Youtube-dl Meta')
		        })
		    } else if (args.resource == 'stream') {
		        var metaUrl = args.id.replace(defaults.prefix + '_', '').replace('|', ':')
		        videoQueue.push({ id: metaUrl }, (err, resp) => {
		        	if (!err && resp) {
		        		let streams
		                 if (resp.formats) {
		                    streams = resp.formats.map(el => {
		                        return {
		                          availability: 1,
		                          url: el.url,
		                          title: el.format_id ? el.format_id : el.height ? (el.height + 'p') : '360p',
		                          tag: [(el.ext || 'mp4')],
		                          isFree: 1,
		                          id: args.id
		                        }
		                      })
		                } else {
		                    var el = resp
		                    streams = [{
		                      availability: 1,
		                      url: el.url,
		                      title: el.format_id && isNaN(el.format_id) ? el.format_id : el.height ? (el.height + 'p') : '360p',
		                      tag: [(el.ext || 'mp4')],
		                      isFree: 1,
		                      id: args.id
		                    }]
		                }
		                if (streams && streams.length)
			                resolve({ streams })
			            else
			            	reject(defaults.name + ' - No stream results from Youtube-dl')
		        	} else
		        		reject(defaults.name + ' - Could not get Youtube-dl Meta')
		        })
			}
		})
	}
}
