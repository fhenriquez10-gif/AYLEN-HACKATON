window.NASA_ENGINE="const EARTH_RADIUS = 6371007;\r\nconst radians = degrees => degrees * Math.PI / 180;\r\nconst atDay = timestamp => timestamp.slice(0, 10);\r\nconst pad = n => String(n).padStart(2, \"0\");\r\nconst monthKey = index => `${Math.floor(index / 12)}-${pad(index % 12 + 1)}`;\r\nconst monthIndex = key => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;\r\nconst season = key => Number(key.slice(0, 4)) - (Number(key.slice(5, 7)) \u003c 7 ? 1 : 0);\r\nconst total = list => list.reduce((sum, value) => sum + value, 0);\r\nconst mean = list => list.length ? total(list) / list.length : null;\r\nconst clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));\r\n\r\nfunction quantile(list, probability) {\r\n  if (!list.length) return null;\r\n  const sorted = [...list].sort((a, b) => a - b);\r\n  const index = (sorted.length - 1) * probability;\r\n  const lower = Math.floor(index);\r\n  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);\r\n}\r\n\r\nfunction* csvRows(text) {\r\n  let row = [];\r\n  let field = \"\";\r\n  let quoted = false;\r\n  for (let i = 0; i \u003c text.length; i++) {\r\n    const char = text[i];\r\n    if (quoted) {\r\n      if (char !== '\"') field += char;\r\n      else if (text[i + 1] === '\"') { field += '\"'; i++; }\r\n      else quoted = false;\r\n      continue;\r\n    }\r\n    if (char === '\"' && !field) quoted = true;\r\n    else if (char === \",\") { row.push(field); field = \"\"; }\r\n    else if (char === \"\\n\" || char === \"\\r\") {\r\n      if (char === \"\\r\" && text[i + 1] === \"\\n\") i++;\r\n      row.push(field);\r\n      if (row.some(cell => cell.trim())) yield row;\r\n      row = [];\r\n      field = \"\";\r\n    } else field += char;\r\n  }\r\n  if (quoted) throw new Error(\"El CSV contiene un campo entre comillas sin cerrar.\");\r\n  row.push(field);\r\n  if (row.some(cell => cell.trim())) yield row;\r\n}\r\n\r\nfunction parseFirms(text, sensor) {\r\n  const rows = csvRows(text);\r\n  const header = rows.next().value?.map(field => field.trim().toLowerCase()) ?? [];\r\n  const required = [\"longitude\", \"latitude\", \"acq_date\", \"acq_time\"];\r\n  if (required.some(key => !header.includes(key))) {\r\n    throw new Error(\"El CSV debe incluir longitude, latitude, acq_date y acq_time.\");\r\n  }\r\n  const index = Object.fromEntries(header.map((key, i) => [key, i]));\r\n  const points = [];\r\n  let rowNumber = 1;\r\n  for (const row of rows) {\r\n    rowNumber++;\r\n    const lon = row[index.longitude]?.trim();\r\n    const lat = row[index.latitude]?.trim();\r\n    const date = row[index.acq_date]?.trim();\r\n    const time = row[index.acq_time]?.trim();\r\n    const instrument = row[index.instrument]?.trim().toUpperCase();\r\n    if (instrument && instrument !== sensor) {\r\n      throw new Error(`En la fila ${rowNumber} figura ${instrument}, pero el archivo se cargó como ${sensor}.`);\r\n    }\r\n    const hhmm = time?.padStart(4, \"0\");\r\n    const iso = `${date}T${hhmm?.slice(0, 2)}:${hhmm?.slice(2)}:00Z`;\r\n    const timestamp = Date.parse(iso);\r\n    if (!lon || !lat || !Number.isFinite(+lon) || !Number.isFinite(+lat) || Math.abs(+lon) > 180 ||\r\n        Math.abs(+lat) > 90 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date ?? \"\") ||\r\n        !/^\\d{1,4}$/.test(time ?? \"\") || +hhmm.slice(0, 2) >= 24 || +hhmm.slice(2) >= 60 ||\r\n        !Number.isFinite(timestamp) || atDay(new Date(timestamp).toISOString()) !== date) {\r\n      throw new Error(`Fila ${rowNumber} inválida. Revisa coordenadas, fecha y hora UTC.`);\r\n    }\r\n    points.push({\r\n      lon: +lon, lat: +lat, timestamp, sensor,\r\n      satellite: row[index.satellite]?.trim() || \"\",\r\n      version: row[index.version]?.trim() || \"\",\r\n    });\r\n  }\r\n  return points;\r\n}\r\n\r\nfunction parseArea(geojson) {\r\n  const polygons = [];\r\n  function collect(node) {\r\n    if (node?.type === \"FeatureCollection\") node.features.forEach(collect);\r\n    else if (node?.type === \"Feature\") collect(node.geometry);\r\n    else if (node?.type === \"Polygon\") polygons.push(node.coordinates);\r\n    else if (node?.type === \"MultiPolygon\") polygons.push(...node.coordinates);\r\n    else throw new Error(\"El GeoJSON debe contener únicamente polígonos o multipolígonos.\");\r\n  }\r\n  collect(geojson);\r\n  if (!polygons.length || polygons.some(poly => !poly.length)) throw new Error(\"El GeoJSON no contiene un área.\");\r\n  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;\r\n  for (const polygon of polygons) for (const ring of polygon) {\r\n    if (ring.length \u003c 4) throw new Error(\"Un anillo del GeoJSON tiene menos de cuatro coordenadas.\");\r\n    for (const [lon, lat] of ring) {\r\n      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {\r\n        throw new Error(\"El GeoJSON debe usar longitud y latitud en WGS 84.\");\r\n      }\r\n      west = Math.min(west, lon); east = Math.max(east, lon);\r\n      south = Math.min(south, lat); north = Math.max(north, lat);\r\n    }\r\n    const first = ring[0], last = ring.at(-1);\r\n    if (first[0] !== last[0] || first[1] !== last[1]) throw new Error(\"Cada anillo del GeoJSON debe estar cerrado.\");\r\n  }\r\n  if (east - west > 90 || north - south > 90 || east === west || north === south) {\r\n    throw new Error(\"Elige una zona regional válida que no cruce el antimeridiano.\");\r\n  }\r\n  return { polygons, bounds: [west, south, east, north] };\r\n}\r\n\r\nfunction insideArea(lon, lat, area) {\r\n  const [west, south, east, north] = area.bounds;\r\n  if (lon \u003c west || lon > east || lat \u003c south || lat > north) return false;\r\n  return area.polygons.some(polygon => {\r\n    let inside = false;\r\n    for (const ring of polygon) for (let i = 1; i \u003c ring.length; i++) {\r\n      const [ax, ay] = ring[i - 1], [bx, by] = ring[i];\r\n      const cross = (lon - ax) * (by - ay) - (lat - ay) * (bx - ax);\r\n      if (Math.abs(cross) \u003c 1e-12 && lon >= Math.min(ax, bx) && lon \u003c= Math.max(ax, bx) &&\r\n          lat >= Math.min(ay, by) && lat \u003c= Math.max(ay, by)) return true;\r\n      if ((ay > lat) !== (by > lat) && lon \u003c ax + (bx - ax) * (lat - ay) / (by - ay)) inside = !inside;\r\n    }\r\n    return inside;\r\n  });\r\n}\r\n\r\nfunction projector() {\r\n  const lon0 = radians(-72), lat0 = radians(-38);\r\n  const sin0 = Math.sin(lat0), cos0 = Math.cos(lat0);\r\n  return (lon, lat) => {\r\n    const phi = radians(lat), delta = radians(lon) - lon0;\r\n    const sin = Math.sin(phi), cos = Math.cos(phi);\r\n    const k = EARTH_RADIUS * Math.sqrt(2 / (1 + sin0 * sin + cos0 * cos * Math.cos(delta)));\r\n    return [k * cos * Math.sin(delta), k * (cos0 * sin - sin0 * cos * Math.cos(delta))];\r\n  };\r\n}\r\n\r\n// Densify geographic segments before projecting so long polygon edges follow the projected outline.\r\nfunction projectArea(area, project) {\r\n  return area.polygons.map(polygon => polygon.map(ring => {\r\n    const projected = [];\r\n    for (let i = 1; i \u003c ring.length; i++) {\r\n      const [x0, y0] = ring[i - 1], [x1, y1] = ring[i];\r\n      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / .01));\r\n      for (let step = 0; step \u003c steps; step++) {\r\n        const t = step / steps;\r\n        projected.push(project(x0 + t * (x1 - x0), y0 + t * (y1 - y0)));\r\n      }\r\n    }\r\n    projected.push(project(...ring.at(-1)));\r\n    return projected;\r\n  }));\r\n}\r\n\r\nfunction gridCapacity(polygons, size) {\r\n  // Interior scan-line spans plus the cells traversed by polygon edges.\r\n  const rows = new Map();\r\n  function getRow(index) {\r\n    if (!rows.has(index)) rows.set(index, []);\r\n    return rows.get(index);\r\n  }\r\n  for (const polygon of polygons) {\r\n    const crossings = new Map();\r\n    for (const ring of polygon) for (let i = 1; i \u003c ring.length; i++) {\r\n      const [x0, y0] = ring[i - 1], [x1, y1] = ring[i];\r\n      const lowerY = Math.min(y0, y1), upperY = Math.max(y0, y1);\r\n      if ((upperY - lowerY) / size > 100000) throw new Error(\"Selecciona celdas mayores para este polígono.\");\r\n      for (let j = Math.floor(lowerY / size); j \u003c= Math.floor(upperY / size); j++) {\r\n        const leftX = y0 === y1 ? x0 : x0 + (x1 - x0) * (Math.max(lowerY, j * size) - y0) / (y1 - y0);\r\n        const rightX = y0 === y1 ? x1 : x0 + (x1 - x0) * (Math.min(upperY, (j + 1) * size) - y0) / (y1 - y0);\r\n        getRow(j).push([Math.floor(Math.min(leftX, rightX) / size), Math.floor(Math.max(leftX, rightX) / size)]);\r\n        const mid = (j + .5) * size;\r\n        if (mid >= lowerY && mid \u003c upperY) {\r\n          if (!crossings.has(j)) crossings.set(j, []);\r\n          crossings.get(j).push(x0 + (x1 - x0) * (mid - y0) / (y1 - y0));\r\n        }\r\n      }\r\n    }\r\n    for (const [j, xs] of crossings) {\r\n      xs.sort((a, b) => a - b);\r\n      for (let i = 1; i \u003c xs.length; i += 2) {\r\n        getRow(j).push([Math.floor(xs[i - 1] / size), Math.floor(xs[i] / size)]);\r\n      }\r\n    }\r\n  }\r\n  let count = 0;\r\n  for (const spans of rows.values()) {\r\n    spans.sort((a, b) => a[0] - b[0]);\r\n    let end = -Infinity;\r\n    for (const [lo, hi] of spans) {\r\n      const newStart = Math.max(end + 1, lo);\r\n      if (newStart \u003c= hi) count += hi - newStart + 1;\r\n      end = Math.max(end, hi);\r\n    }\r\n  }\r\n  return count;\r\n}\r\n\r\nfunction randomGenerator(seed) {\r\n  return () => {\r\n    seed = (seed + 0x6D2B79F5) >>> 0;\r\n    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);\r\n    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);\r\n    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;\r\n  };\r\n}\r\n\r\nfunction localDayFormatter(timezone) {\r\n  const format = new Intl.DateTimeFormat(\"sv-SE\", { year: \"numeric\", month: \"2-digit\", day: \"2-digit\", timeZone: timezone });\r\n  const cache = new Map();\r\n  return timestamp => {\r\n    if (!cache.has(timestamp)) cache.set(timestamp, format.format(timestamp));\r\n    return cache.get(timestamp);\r\n  };\r\n}\r\n\r\nfunction rangeFor(records, supplied, localDay, label) {\r\n  let earliest, latest;\r\n  for (const {timestamp} of records) {\r\n    earliest = earliest === undefined ? timestamp : Math.min(earliest, timestamp);\r\n    latest = latest === undefined ? timestamp : Math.max(latest, timestamp);\r\n  }\r\n  const inferred = !supplied?.start || !supplied?.end;\r\n  // Drop inferred edge months because file rows alone do not establish full-month coverage.\r\n  const start = supplied?.start || (earliest === undefined ? \"\" : monthKey(monthIndex(localDay(earliest)) + 1));\r\n  const end = supplied?.end || (latest === undefined ? \"\" : monthKey(monthIndex(localDay(latest)) - 1));\r\n  if (!/^\\d{4}-(0[1-9]|1[012])$/.test(start) || !/^\\d{4}-(0[1-9]|1[012])$/.test(end) || start > end) {\r\n    throw new Error(`Indica el primer y último mes completo del archivo ${label}.`);\r\n  }\r\n  return { start, end, inferred };\r\n}\r\n\r\nfunction monthlyPoints(points, bounds, area, localDay, project) {\r\n  const months = new Map();\r\n  const seen = new Set();\r\n  for (const point of points) {\r\n    if (!insideArea(point.lon, point.lat, area)) continue;\r\n    const day = localDay(point.timestamp);\r\n    const month = day.slice(0, 7);\r\n    if (month \u003c bounds.start || month > bounds.end) continue;\r\n    const identity = `${point.timestamp}/${point.lon}/${point.lat}/${point.satellite}`;\r\n    if (seen.has(identity)) continue;\r\n    seen.add(identity);\r\n    const [x, y] = project(point.lon, point.lat);\r\n    if (!months.has(month)) months.set(month, []);\r\n    months.get(month).push({ x, y, day: +day.slice(8, 10), satellite: point.satellite });\r\n  }\r\n  return months;\r\n}\r\n\r\nfunction countDaysCells(modis, viirs, size, dx = 0, dy = 0) {\r\n  function cells(points) {\r\n    return new Set(points.map(({ x, y, day }) => `${day}/${Math.floor((x - dx) / size)}/${Math.floor((y - dy) / size)}`));\r\n  }\r\n  const mCells = cells(modis), vCells = cells(viirs);\r\n  let common = 0;\r\n  for (const item of mCells) if (vCells.has(item)) common++;\r\n  return { m: mCells.size, v: vCells.size, common, integrated: mCells.size + vCells.size - common };\r\n}\r\n\r\nconst logistic = q => 1 / (1 + Math.exp(-clamp(q, -35, 35)));\r\nconst dot = (a, b) => total(a.map((value, i) => value * b[i]));\r\n\r\nfunction solve(matrix, vector) {\r\n  const n = vector.length;\r\n  const rows = matrix.map((row, i) => [...row, vector[i]]);\r\n  for (let i = 0; i \u003c n; i++) {\r\n    let pivot = i;\r\n    for (let row = i + 1; row \u003c n; row++) {\r\n      if (Math.abs(rows[row][i]) > Math.abs(rows[pivot][i])) pivot = row;\r\n    }\r\n    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];\r\n    const divisor = rows[i][i];\r\n    for (let col = i; col \u003c= n; col++) rows[i][col] /= divisor;\r\n    for (let row = 0; row \u003c n; row++) {\r\n      if (row === i) continue;\r\n      const factor = rows[row][i];\r\n      for (let col = i; col \u003c= n; col++) rows[row][col] -= factor * rows[i][col];\r\n    }\r\n  }\r\n  return rows.map(row => row[n]);\r\n}\r\n\r\nfunction features(row, sensor) {\r\n  const monthAngle = (Number(row.month.slice(5)) - 1) * (2 * Math.PI / 12);\r\n  return [1, Math.log1p(1000 * row[sensor] / row.capacity), Math.sin(monthAngle), Math.cos(monthAngle)];\r\n}\r\n\r\nfunction fitMissing(rows, sensor) {\r\n  const extras = total(rows.map(row => row.integrated - row[sensor]));\r\n  if (!extras) return row => row[sensor];\r\n  const available = total(rows.map(row => row.capacity - row[sensor]));\r\n  const x = rows.map(row => features(row, sensor));\r\n  const beta = [Math.log((extras + .5) / (available - extras + .5)), 0, 0, 0];\r\n  const penalty = [.02, 1, 1, 1];\r\n  function objective(coefficients) {\r\n    let value = -total(coefficients.map((coef, i) => .5 * penalty[i] * coef ** 2));\r\n    rows.forEach((row, i) => {\r\n      const eta = dot(x[i], coefficients);\r\n      const logSum = Math.max(0, eta) + Math.log1p(Math.exp(-Math.abs(eta)));\r\n      value += (row.integrated - row[sensor]) * eta - (row.capacity - row[sensor]) * logSum;\r\n    });\r\n    return value;\r\n  }\r\n  for (let pass = 0; pass \u003c 40; pass++) {\r\n    const score = beta.map((value, i) => -value * penalty[i]);\r\n    const info = beta.map((_, i) => beta.map((__, j) => i === j ? penalty[i] : 0));\r\n    rows.forEach((row, index) => {\r\n      const a = x[index];\r\n      const probability = logistic(dot(a, beta));\r\n      const trials = row.capacity - row[sensor];\r\n      const residual = row.integrated - row[sensor] - trials * probability;\r\n      const weight = trials * probability * (1 - probability);\r\n      for (let i = 0; i \u003c beta.length; i++) {\r\n        score[i] += residual * a[i];\r\n        for (let j = 0; j \u003c beta.length; j++) info[i][j] += weight * a[i] * a[j];\r\n      }\r\n    });\r\n    const step = solve(info, score);\r\n    if (Math.max(...step.map(Math.abs)) \u003c 1e-7) break;\r\n    const before = objective(beta);\r\n    let fraction = 1;\r\n    while (fraction >= 1 / 1024) {\r\n      const candidate = beta.map((value, i) => value + step[i] * fraction);\r\n      if (objective(candidate) >= before) {\r\n        beta.splice(0, beta.length, ...candidate);\r\n        break;\r\n      }\r\n      fraction /= 2;\r\n    }\r\n    if (fraction \u003c 1 / 1024) break;\r\n  }\r\n  return row => clamp(row[sensor] + (row.capacity - row[sensor]) * logistic(dot(features(row, sensor), beta)), row[sensor], row.capacity);\r\n}\r\n\r\nfunction seasonalBaseline(rows, sensor) {\r\n  const rates = rows.map(row => ({month: row.month.slice(5), rate: (row.integrated - row[sensor]) / Math.max(1, row.capacity - row[sensor])}));\r\n  const fallback = quantile(rates.map(item => item.rate), .5);\r\n  return row => {\r\n    const matching = rates.filter(item => item.month === row.month.slice(5));\r\n    const rate = quantile(matching.map(item => item.rate), .5) ?? fallback;\r\n    return row[sensor] + (row.capacity - row[sensor]) * rate;\r\n  };\r\n}\r\n\r\nfunction validate(rows, sensor) {\r\n  const grouped = Map.groupBy ? Map.groupBy(rows, row => season(row.month)) :\r\n    new Map([...new Set(rows.map(row => season(row.month)))].map(year => [year, rows.filter(row => season(row.month) === year)]));\r\n  const residuals = [], baselineResiduals = [], cases = [];\r\n  let actualSum = 0, detectedIntense = 0, intense = 0, falseIntense = 0;\r\n  const completeSeasons = [...grouped].filter(([, months]) => months.length === 12);\r\n  for (const [year, heldOut] of completeSeasons) {\r\n    const train = rows.filter(row => season(row.month) !== year);\r\n    if (!train.some(row => row.integrated > 0)) continue;\r\n    const predict = fitMissing(train, sensor);\r\n    const baseline = seasonalBaseline(train, sensor);\r\n    const threshold = quantile(train.filter(row => row.integrated > 0).map(row => row.integrated), .9);\r\n    for (const row of heldOut) {\r\n      const fitted = predict(row);\r\n      const expected = row.integrated;\r\n      actualSum += expected;\r\n      residuals.push(expected - fitted);\r\n      baselineResiduals.push(expected - baseline(row));\r\n      cases.push({month: row.month, observed: row[sensor], actual: expected, estimate: fitted});\r\n      if (expected >= threshold) {\r\n        intense++;\r\n        if (fitted >= threshold) detectedIntense++;\r\n      } else if (fitted >= threshold) falseIntense++;\r\n    }\r\n  }\r\n  const absoluteSum = total(residuals.map(Math.abs));\r\n  const predictedIntense = detectedIntense + falseIntense;\r\n  return {\r\n    mae: mean(residuals.map(Math.abs)), bias: residuals.length ? -mean(residuals) : null,\r\n    error: actualSum ? absoluteSum / actualSum : null,\r\n    baselineError: actualSum ? total(baselineResiduals.map(Math.abs)) / actualSum : null,\r\n    rawError: actualSum ? (actualSum - total(cases.map(row => row.observed))) / actualSum : null,\r\n    recall: intense ? detectedIntense / intense : null,\r\n    precision: predictedIntense ? detectedIntense / predictedIntense : null,\r\n    intense, seasons: [...new Set(cases.map(row => season(row.month)))].length, cases,\r\n    residuals,\r\n  };\r\n}\r\n\r\nfunction calendar(rows, overlap, modis, viirs) {\r\n  const models = {\r\n    m: { predict: fitMissing(overlap, \"m\"), residuals: modis.residuals },\r\n    v: { predict: fitMissing(overlap, \"v\"), residuals: viirs.residuals },\r\n  };\r\n  const computed = rows.map(row => {\r\n    if (row.hasM && row.hasV) return { ...row, value: row.integrated, regime: \"MODIS + VIIRS\", lo: null, hi: null };\r\n    if (!row.hasM && !row.hasV) return { ...row, value: null, regime: \"Sin periodo de datos\", lo: null, hi: null };\r\n    const sensor = row.hasM ? \"m\" : \"v\";\r\n    const {predict, residuals} = models[sensor];\r\n    const value = predict(row);\r\n    const lo = quantile(residuals, .05), hi = quantile(residuals, .95);\r\n    return { ...row, value, regime: row.hasM ? \"Estimado desde MODIS\" : \"Estimado desde VIIRS\",\r\n      lo: lo === null ? null : Math.floor(clamp(value + Math.min(lo, 0), row[sensor], row.capacity)),\r\n      hi: hi === null ? null : Math.ceil(clamp(value + Math.max(hi, 0), row[sensor], row.capacity)),\r\n    };\r\n  });\r\n  const baselineByMonth = Array.from({length: 12}, (_, index) =>\r\n    quantile(overlap.filter(row => Number(row.month.slice(5)) === index + 1).map(row => row.integrated), .5));\r\n  return computed.map(row => ({ ...row, baseline: baselineByMonth[Number(row.month.slice(5)) - 1] }));\r\n}\r\n\r\nfunction analyze(input, report = () => {}) {\r\n  const { config, modis, viirs } = input;\r\n  const area = parseArea(input.area);\r\n  const project = projector();\r\n  const polygons = projectArea(area, project);\r\n  const localDay = localDayFormatter(config.timezone);\r\n  const limitsM = rangeFor(modis, config.modis, localDay, \"MODIS\");\r\n  const limitsV = rangeFor(viirs, config.viirs, localDay, \"VIIRS\");\r\n  const mMonths = monthlyPoints(modis, limitsM, area, localDay, project);\r\n  const vMonths = monthlyPoints(viirs, limitsV, area, localDay, project);\r\n  const first = monthIndex(limitsM.start \u003c limitsV.start ? limitsM.start : limitsV.start);\r\n  const last = monthIndex(limitsM.end > limitsV.end ? limitsM.end : limitsV.end);\r\n  if (last - first > 1199) throw new Error(\"Revisa las fechas. El análisis admite hasta 100 años.\");\r\n  const locations = Array.from({length: last - first + 1}, (_, i) => {\r\n    const month = monthKey(first + i);\r\n    return { month, hasM: month >= limitsM.start && month \u003c= limitsM.end, hasV: month >= limitsV.start && month \u003c= limitsV.end,\r\n      modisPoints: mMonths.get(month) ?? [], viirsPoints: vMonths.get(month) ?? [],\r\n      days: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate(),\r\n    };\r\n  });\r\n  const overlap = locations.filter(row => row.hasM && row.hasV);\r\n  if (!overlap.some(row => row.modisPoints.length) || !overlap.some(row => row.viirsPoints.length)) {\r\n    throw new Error(\"Se necesitan detecciones MODIS y VIIRS dentro del polígono durante meses de solapamiento.\");\r\n  }\r\n  const sizes = [...config.sizes].sort((a, b) => a - b);\r\n  const scales = sizes.map((km, scaleIndex) => {\r\n    const size = km * 1000;\r\n    const cellCount = gridCapacity(polygons, size);\r\n    const rows = locations.map(row => ({\r\n      month: row.month, hasM: row.hasM, hasV: row.hasV, capacity: row.days * cellCount,\r\n      ...countDaysCells(row.modisPoints, row.viirsPoints, size),\r\n    }));\r\n    const both = rows.filter(row => row.hasM && row.hasV);\r\n    if (rows.some(row => row.integrated > row.capacity)) throw new Error(\"El polígono no permite calcular la capacidad de la cuadrícula de forma consistente.\");\r\n    const activeMonths = overlap.filter(row => row.modisPoints.length || row.viirsPoints.length);\r\n    const runs = activeMonths.map(row => ({month: row.month, values: []}));\r\n    const random = randomGenerator(config.seed);\r\n    for (let i = 0; i \u003c config.iterations; i++) {\r\n      const dx = random() * size, dy = random() * size;\r\n      activeMonths.forEach((row, index) => {\r\n        runs[index].values.push(countDaysCells(row.modisPoints, row.viirsPoints, size, dx, dy).integrated);\r\n      });\r\n      if (i % 5 === 0) report(Math.floor(100 * (scaleIndex + i / config.iterations) / sizes.length));\r\n    }\r\n    const sensitivity = runs.map(({month, values}) => {\r\n      const lo = quantile(values, .05), hi = quantile(values, .95), middle = quantile(values, .5);\r\n      return {month, lo, hi, median: middle, spread: (hi - lo) / Math.max(1, middle)};\r\n    });\r\n    const m = validate(both, \"m\"), v = validate(both, \"v\");\r\n    const spread = quantile(sensitivity.map(row => row.spread), .5);\r\n    const recall = m.recall === null || v.recall === null ? null : Math.min(m.recall, v.recall);\r\n    const passes = m.seasons >= 2 && v.seasons >= 2 && m.error !== null && v.error !== null && recall !== null\r\n      && spread \u003c= config.maxSpread && Math.max(m.error, v.error) \u003c= config.maxError && recall >= config.minRecall\r\n      && m.error \u003c= Math.min(m.baselineError, m.rawError) + 1e-9\r\n      && v.error \u003c= Math.min(v.baselineError, v.rawError) + 1e-9;\r\n    const byMonth = new Map(sensitivity.map(row => [row.month, row]));\r\n    return { km, cellCount, spread, recall, passes, m, v,\r\n      months: calendar(rows, both, m, v).map(row => ({ ...row, sensitivity: byMonth.get(row.month) ?? null })),\r\n    };\r\n  });\r\n  report(100);\r\n  const recommended = scales.find(scale => scale.passes)?.km ?? null;\r\n  const base = { limitsM, limitsV, overlapMonths: overlap.length, inputCounts: [modis.length, viirs.length],\r\n    keptCounts: [total([...mMonths.values()].map(list => list.length)), total([...vMonths.values()].map(list => list.length))],\r\n    platforms: [modis, viirs].map(points => [...new Set(points.map(point => point.satellite).filter(Boolean))].sort()),\r\n    config, scales, recommended,\r\n  };\r\n  return base;\r\n}\r\n";
(function(){
const EARTH_RADIUS = 6371007;
const radians = degrees => degrees * Math.PI / 180;
const atDay = timestamp => timestamp.slice(0, 10);
const pad = n => String(n).padStart(2, "0");
const monthKey = index => `${Math.floor(index / 12)}-${pad(index % 12 + 1)}`;
const monthIndex = key => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const season = key => Number(key.slice(0, 4)) - (Number(key.slice(5, 7)) < 7 ? 1 : 0);
const total = list => list.reduce((sum, value) => sum + value, 0);
const mean = list => list.length ? total(list) / list.length : null;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function quantile(list, probability) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function* csvRows(text) {
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
      continue;
    }
    if (char === '"' && !field) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(cell => cell.trim())) yield row;
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("El CSV contiene un campo entre comillas sin cerrar.");
  row.push(field);
  if (row.some(cell => cell.trim())) yield row;
}

function parseFirms(text, sensor) {
  const rows = csvRows(text);
  const header = rows.next().value?.map(field => field.trim().toLowerCase()) ?? [];
  const required = ["longitude", "latitude", "acq_date", "acq_time"];
  if (required.some(key => !header.includes(key))) {
    throw new Error("El CSV debe incluir longitude, latitude, acq_date y acq_time.");
  }
  const index = Object.fromEntries(header.map((key, i) => [key, i]));
  const points = [];
  let rowNumber = 1;
  for (const row of rows) {
    rowNumber++;
    const lon = row[index.longitude]?.trim();
    const lat = row[index.latitude]?.trim();
    const date = row[index.acq_date]?.trim();
    const time = row[index.acq_time]?.trim();
    const instrument = row[index.instrument]?.trim().toUpperCase();
    if (instrument && instrument !== sensor) {
      throw new Error(`En la fila ${rowNumber} figura ${instrument}, pero el archivo se cargó como ${sensor}.`);
    }
    const hhmm = time?.padStart(4, "0");
    const iso = `${date}T${hhmm?.slice(0, 2)}:${hhmm?.slice(2)}:00Z`;
    const timestamp = Date.parse(iso);
    if (!lon || !lat || !Number.isFinite(+lon) || !Number.isFinite(+lat) || Math.abs(+lon) > 180 ||
        Math.abs(+lat) > 90 || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ||
        !/^\d{1,4}$/.test(time ?? "") || +hhmm.slice(0, 2) >= 24 || +hhmm.slice(2) >= 60 ||
        !Number.isFinite(timestamp) || atDay(new Date(timestamp).toISOString()) !== date) {
      throw new Error(`Fila ${rowNumber} inválida. Revisa coordenadas, fecha y hora UTC.`);
    }
    points.push({
      lon: +lon, lat: +lat, timestamp, sensor,
      satellite: row[index.satellite]?.trim() || "",
      version: row[index.version]?.trim() || "",
    });
  }
  return points;
}

function parseArea(geojson) {
  const polygons = [];
  function collect(node) {
    if (node?.type === "FeatureCollection") node.features.forEach(collect);
    else if (node?.type === "Feature") collect(node.geometry);
    else if (node?.type === "Polygon") polygons.push(node.coordinates);
    else if (node?.type === "MultiPolygon") polygons.push(...node.coordinates);
    else throw new Error("El GeoJSON debe contener únicamente polígonos o multipolígonos.");
  }
  collect(geojson);
  if (!polygons.length || polygons.some(poly => !poly.length)) throw new Error("El GeoJSON no contiene un área.");
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) {
    if (ring.length < 4) throw new Error("Un anillo del GeoJSON tiene menos de cuatro coordenadas.");
    for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
        throw new Error("El GeoJSON debe usar longitud y latitud en WGS 84.");
      }
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
    }
    const first = ring[0], last = ring.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) throw new Error("Cada anillo del GeoJSON debe estar cerrado.");
  }
  if (east - west > 90 || north - south > 90 || east === west || north === south) {
    throw new Error("Elige una zona regional válida que no cruce el antimeridiano.");
  }
  return { polygons, bounds: [west, south, east, north] };
}

function insideArea(lon, lat, area) {
  const [west, south, east, north] = area.bounds;
  if (lon < west || lon > east || lat < south || lat > north) return false;
  return area.polygons.some(polygon => {
    let inside = false;
    for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
      const cross = (lon - ax) * (by - ay) - (lat - ay) * (bx - ax);
      if (Math.abs(cross) < 1e-12 && lon >= Math.min(ax, bx) && lon <= Math.max(ax, bx) &&
          lat >= Math.min(ay, by) && lat <= Math.max(ay, by)) return true;
      if ((ay > lat) !== (by > lat) && lon < ax + (bx - ax) * (lat - ay) / (by - ay)) inside = !inside;
    }
    return inside;
  });
}

function projector() {
  const lon0 = radians(-72), lat0 = radians(-38);
  const sin0 = Math.sin(lat0), cos0 = Math.cos(lat0);
  return (lon, lat) => {
    const phi = radians(lat), delta = radians(lon) - lon0;
    const sin = Math.sin(phi), cos = Math.cos(phi);
    const k = EARTH_RADIUS * Math.sqrt(2 / (1 + sin0 * sin + cos0 * cos * Math.cos(delta)));
    return [k * cos * Math.sin(delta), k * (cos0 * sin - sin0 * cos * Math.cos(delta))];
  };
}

// Densify geographic segments before projecting so long polygon edges follow the projected outline.
function projectArea(area, project) {
  return area.polygons.map(polygon => polygon.map(ring => {
    const projected = [];
    for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1], [x1, y1] = ring[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / .01));
      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        projected.push(project(x0 + t * (x1 - x0), y0 + t * (y1 - y0)));
      }
    }
    projected.push(project(...ring.at(-1)));
    return projected;
  }));
}

function gridCapacity(polygons, size) {
  // Interior scan-line spans plus the cells traversed by polygon edges.
  const rows = new Map();
  function getRow(index) {
    if (!rows.has(index)) rows.set(index, []);
    return rows.get(index);
  }
  for (const polygon of polygons) {
    const crossings = new Map();
    for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1], [x1, y1] = ring[i];
      const lowerY = Math.min(y0, y1), upperY = Math.max(y0, y1);
      if ((upperY - lowerY) / size > 100000) throw new Error("Selecciona celdas mayores para este polígono.");
      for (let j = Math.floor(lowerY / size); j <= Math.floor(upperY / size); j++) {
        const leftX = y0 === y1 ? x0 : x0 + (x1 - x0) * (Math.max(lowerY, j * size) - y0) / (y1 - y0);
        const rightX = y0 === y1 ? x1 : x0 + (x1 - x0) * (Math.min(upperY, (j + 1) * size) - y0) / (y1 - y0);
        getRow(j).push([Math.floor(Math.min(leftX, rightX) / size), Math.floor(Math.max(leftX, rightX) / size)]);
        const mid = (j + .5) * size;
        if (mid >= lowerY && mid < upperY) {
          if (!crossings.has(j)) crossings.set(j, []);
          crossings.get(j).push(x0 + (x1 - x0) * (mid - y0) / (y1 - y0));
        }
      }
    }
    for (const [j, xs] of crossings) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i += 2) {
        getRow(j).push([Math.floor(xs[i - 1] / size), Math.floor(xs[i] / size)]);
      }
    }
  }
  let count = 0;
  for (const spans of rows.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    for (const [lo, hi] of spans) {
      const newStart = Math.max(end + 1, lo);
      if (newStart <= hi) count += hi - newStart + 1;
      end = Math.max(end, hi);
    }
  }
  return count;
}

function randomGenerator(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localDayFormatter(timezone) {
  const format = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone });
  const cache = new Map();
  return timestamp => {
    if (!cache.has(timestamp)) cache.set(timestamp, format.format(timestamp));
    return cache.get(timestamp);
  };
}

function rangeFor(records, supplied, localDay, label) {
  let earliest, latest;
  for (const {timestamp} of records) {
    earliest = earliest === undefined ? timestamp : Math.min(earliest, timestamp);
    latest = latest === undefined ? timestamp : Math.max(latest, timestamp);
  }
  const inferred = !supplied?.start || !supplied?.end;
  // Drop inferred edge months because file rows alone do not establish full-month coverage.
  const start = supplied?.start || (earliest === undefined ? "" : monthKey(monthIndex(localDay(earliest)) + 1));
  const end = supplied?.end || (latest === undefined ? "" : monthKey(monthIndex(localDay(latest)) - 1));
  if (!/^\d{4}-(0[1-9]|1[012])$/.test(start) || !/^\d{4}-(0[1-9]|1[012])$/.test(end) || start > end) {
    throw new Error(`Indica el primer y último mes completo del archivo ${label}.`);
  }
  return { start, end, inferred };
}

function monthlyPoints(points, bounds, area, localDay, project) {
  const months = new Map();
  const seen = new Set();
  for (const point of points) {
    if (!insideArea(point.lon, point.lat, area)) continue;
    const day = localDay(point.timestamp);
    const month = day.slice(0, 7);
    if (month < bounds.start || month > bounds.end) continue;
    const identity = `${point.timestamp}/${point.lon}/${point.lat}/${point.satellite}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const [x, y] = project(point.lon, point.lat);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push({ x, y, day: +day.slice(8, 10), satellite: point.satellite });
  }
  return months;
}

function countDaysCells(modis, viirs, size, dx = 0, dy = 0) {
  function cells(points) {
    return new Set(points.map(({ x, y, day }) => `${day}/${Math.floor((x - dx) / size)}/${Math.floor((y - dy) / size)}`));
  }
  const mCells = cells(modis), vCells = cells(viirs);
  let common = 0;
  for (const item of mCells) if (vCells.has(item)) common++;
  return { m: mCells.size, v: vCells.size, common, integrated: mCells.size + vCells.size - common };
}

const logistic = q => 1 / (1 + Math.exp(-clamp(q, -35, 35)));
const dot = (a, b) => total(a.map((value, i) => value * b[i]));

function solve(matrix, vector) {
  const n = vector.length;
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let row = i + 1; row < n; row++) {
      if (Math.abs(rows[row][i]) > Math.abs(rows[pivot][i])) pivot = row;
    }
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    const divisor = rows[i][i];
    for (let col = i; col <= n; col++) rows[i][col] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === i) continue;
      const factor = rows[row][i];
      for (let col = i; col <= n; col++) rows[row][col] -= factor * rows[i][col];
    }
  }
  return rows.map(row => row[n]);
}

function features(row, sensor) {
  const monthAngle = (Number(row.month.slice(5)) - 1) * (2 * Math.PI / 12);
  return [1, Math.log1p(1000 * row[sensor] / row.capacity), Math.sin(monthAngle), Math.cos(monthAngle)];
}

function fitMissing(rows, sensor) {
  const extras = total(rows.map(row => row.integrated - row[sensor]));
  if (!extras) return row => row[sensor];
  const available = total(rows.map(row => row.capacity - row[sensor]));
  const x = rows.map(row => features(row, sensor));
  const beta = [Math.log((extras + .5) / (available - extras + .5)), 0, 0, 0];
  const penalty = [.02, 1, 1, 1];
  function objective(coefficients) {
    let value = -total(coefficients.map((coef, i) => .5 * penalty[i] * coef ** 2));
    rows.forEach((row, i) => {
      const eta = dot(x[i], coefficients);
      const logSum = Math.max(0, eta) + Math.log1p(Math.exp(-Math.abs(eta)));
      value += (row.integrated - row[sensor]) * eta - (row.capacity - row[sensor]) * logSum;
    });
    return value;
  }
  for (let pass = 0; pass < 40; pass++) {
    const score = beta.map((value, i) => -value * penalty[i]);
    const info = beta.map((_, i) => beta.map((__, j) => i === j ? penalty[i] : 0));
    rows.forEach((row, index) => {
      const a = x[index];
      const probability = logistic(dot(a, beta));
      const trials = row.capacity - row[sensor];
      const residual = row.integrated - row[sensor] - trials * probability;
      const weight = trials * probability * (1 - probability);
      for (let i = 0; i < beta.length; i++) {
        score[i] += residual * a[i];
        for (let j = 0; j < beta.length; j++) info[i][j] += weight * a[i] * a[j];
      }
    });
    const step = solve(info, score);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
    const before = objective(beta);
    let fraction = 1;
    while (fraction >= 1 / 1024) {
      const candidate = beta.map((value, i) => value + step[i] * fraction);
      if (objective(candidate) >= before) {
        beta.splice(0, beta.length, ...candidate);
        break;
      }
      fraction /= 2;
    }
    if (fraction < 1 / 1024) break;
  }
  return row => clamp(row[sensor] + (row.capacity - row[sensor]) * logistic(dot(features(row, sensor), beta)), row[sensor], row.capacity);
}

function seasonalBaseline(rows, sensor) {
  const rates = rows.map(row => ({month: row.month.slice(5), rate: (row.integrated - row[sensor]) / Math.max(1, row.capacity - row[sensor])}));
  const fallback = quantile(rates.map(item => item.rate), .5);
  return row => {
    const matching = rates.filter(item => item.month === row.month.slice(5));
    const rate = quantile(matching.map(item => item.rate), .5) ?? fallback;
    return row[sensor] + (row.capacity - row[sensor]) * rate;
  };
}

function validate(rows, sensor) {
  const grouped = Map.groupBy ? Map.groupBy(rows, row => season(row.month)) :
    new Map([...new Set(rows.map(row => season(row.month)))].map(year => [year, rows.filter(row => season(row.month) === year)]));
  const residuals = [], baselineResiduals = [], cases = [];
  let actualSum = 0, detectedIntense = 0, intense = 0, falseIntense = 0;
  const completeSeasons = [...grouped].filter(([, months]) => months.length === 12);
  for (const [year, heldOut] of completeSeasons) {
    const train = rows.filter(row => season(row.month) !== year);
    if (!train.some(row => row.integrated > 0)) continue;
    const predict = fitMissing(train, sensor);
    const baseline = seasonalBaseline(train, sensor);
    const threshold = quantile(train.filter(row => row.integrated > 0).map(row => row.integrated), .9);
    for (const row of heldOut) {
      const fitted = predict(row);
      const expected = row.integrated;
      actualSum += expected;
      residuals.push(expected - fitted);
      baselineResiduals.push(expected - baseline(row));
      cases.push({month: row.month, observed: row[sensor], actual: expected, estimate: fitted});
      if (expected >= threshold) {
        intense++;
        if (fitted >= threshold) detectedIntense++;
      } else if (fitted >= threshold) falseIntense++;
    }
  }
  const absoluteSum = total(residuals.map(Math.abs));
  const predictedIntense = detectedIntense + falseIntense;
  return {
    mae: mean(residuals.map(Math.abs)), bias: residuals.length ? -mean(residuals) : null,
    error: actualSum ? absoluteSum / actualSum : null,
    baselineError: actualSum ? total(baselineResiduals.map(Math.abs)) / actualSum : null,
    rawError: actualSum ? (actualSum - total(cases.map(row => row.observed))) / actualSum : null,
    recall: intense ? detectedIntense / intense : null,
    precision: predictedIntense ? detectedIntense / predictedIntense : null,
    intense, seasons: [...new Set(cases.map(row => season(row.month)))].length, cases,
    residuals,
  };
}

function calendar(rows, overlap, modis, viirs) {
  const models = {
    m: { predict: fitMissing(overlap, "m"), residuals: modis.residuals },
    v: { predict: fitMissing(overlap, "v"), residuals: viirs.residuals },
  };
  const computed = rows.map(row => {
    if (row.hasM && row.hasV) return { ...row, value: row.integrated, regime: "MODIS + VIIRS", lo: null, hi: null };
    if (!row.hasM && !row.hasV) return { ...row, value: null, regime: "Sin periodo de datos", lo: null, hi: null };
    const sensor = row.hasM ? "m" : "v";
    const {predict, residuals} = models[sensor];
    const value = predict(row);
    const lo = quantile(residuals, .05), hi = quantile(residuals, .95);
    return { ...row, value, regime: row.hasM ? "Estimado desde MODIS" : "Estimado desde VIIRS",
      lo: lo === null ? null : Math.floor(clamp(value + Math.min(lo, 0), row[sensor], row.capacity)),
      hi: hi === null ? null : Math.ceil(clamp(value + Math.max(hi, 0), row[sensor], row.capacity)),
    };
  });
  const baselineByMonth = Array.from({length: 12}, (_, index) =>
    quantile(overlap.filter(row => Number(row.month.slice(5)) === index + 1).map(row => row.integrated), .5));
  return computed.map(row => ({ ...row, baseline: baselineByMonth[Number(row.month.slice(5)) - 1] }));
}

function analyze(input, report = () => {}) {
  const { config, modis, viirs } = input;
  const area = parseArea(input.area);
  const project = projector();
  const polygons = projectArea(area, project);
  const localDay = localDayFormatter(config.timezone);
  const limitsM = rangeFor(modis, config.modis, localDay, "MODIS");
  const limitsV = rangeFor(viirs, config.viirs, localDay, "VIIRS");
  const mMonths = monthlyPoints(modis, limitsM, area, localDay, project);
  const vMonths = monthlyPoints(viirs, limitsV, area, localDay, project);
  const first = monthIndex(limitsM.start < limitsV.start ? limitsM.start : limitsV.start);
  const last = monthIndex(limitsM.end > limitsV.end ? limitsM.end : limitsV.end);
  if (last - first > 1199) throw new Error("Revisa las fechas. El análisis admite hasta 100 años.");
  const locations = Array.from({length: last - first + 1}, (_, i) => {
    const month = monthKey(first + i);
    return { month, hasM: month >= limitsM.start && month <= limitsM.end, hasV: month >= limitsV.start && month <= limitsV.end,
      modisPoints: mMonths.get(month) ?? [], viirsPoints: vMonths.get(month) ?? [],
      days: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate(),
    };
  });
  const overlap = locations.filter(row => row.hasM && row.hasV);
  if (!overlap.some(row => row.modisPoints.length) || !overlap.some(row => row.viirsPoints.length)) {
    throw new Error("Se necesitan detecciones MODIS y VIIRS dentro del polígono durante meses de solapamiento.");
  }
  const sizes = [...config.sizes].sort((a, b) => a - b);
  const scales = sizes.map((km, scaleIndex) => {
    const size = km * 1000;
    const cellCount = gridCapacity(polygons, size);
    const rows = locations.map(row => ({
      month: row.month, hasM: row.hasM, hasV: row.hasV, capacity: row.days * cellCount,
      ...countDaysCells(row.modisPoints, row.viirsPoints, size),
    }));
    const both = rows.filter(row => row.hasM && row.hasV);
    if (rows.some(row => row.integrated > row.capacity)) throw new Error("El polígono no permite calcular la capacidad de la cuadrícula de forma consistente.");
    const activeMonths = overlap.filter(row => row.modisPoints.length || row.viirsPoints.length);
    const runs = activeMonths.map(row => ({month: row.month, values: []}));
    const random = randomGenerator(config.seed);
    for (let i = 0; i < config.iterations; i++) {
      const dx = random() * size, dy = random() * size;
      activeMonths.forEach((row, index) => {
        runs[index].values.push(countDaysCells(row.modisPoints, row.viirsPoints, size, dx, dy).integrated);
      });
      if (i % 5 === 0) report(Math.floor(100 * (scaleIndex + i / config.iterations) / sizes.length));
    }
    const sensitivity = runs.map(({month, values}) => {
      const lo = quantile(values, .05), hi = quantile(values, .95), middle = quantile(values, .5);
      return {month, lo, hi, median: middle, spread: (hi - lo) / Math.max(1, middle)};
    });
    const m = validate(both, "m"), v = validate(both, "v");
    const spread = quantile(sensitivity.map(row => row.spread), .5);
    const recall = m.recall === null || v.recall === null ? null : Math.min(m.recall, v.recall);
    const passes = m.seasons >= 2 && v.seasons >= 2 && m.error !== null && v.error !== null && recall !== null
      && spread <= config.maxSpread && Math.max(m.error, v.error) <= config.maxError && recall >= config.minRecall
      && m.error <= Math.min(m.baselineError, m.rawError) + 1e-9
      && v.error <= Math.min(v.baselineError, v.rawError) + 1e-9;
    const byMonth = new Map(sensitivity.map(row => [row.month, row]));
    return { km, cellCount, spread, recall, passes, m, v,
      months: calendar(rows, both, m, v).map(row => ({ ...row, sensitivity: byMonth.get(row.month) ?? null })),
    };
  });
  report(100);
  const recommended = scales.find(scale => scale.passes)?.km ?? null;
  const base = { limitsM, limitsV, overlapMonths: overlap.length, inputCounts: [modis.length, viirs.length],
    keptCounts: [total([...mMonths.values()].map(list => list.length)), total([...vMonths.values()].map(list => list.length))],
    platforms: [modis, viirs].map(points => [...new Set(points.map(point => point.satellite).filter(Boolean))].sort()),
    config, scales, recommended,
  };
  return base;
}

window.NASA_MODEL={projector,countDaysCells,analyze,parseArea,insideArea};})();
