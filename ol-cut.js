/**
* Rotates a projection to oblique aspect and registers transform functions between EPSG:4326 and the new projection.
* @param {ol.proj.ProjectionLike} projection Original projection.
* Transform function between EPSG:4326 and this projection must be defined earlier in either OpenLayers or proj4js.
* @param {number} l0 Longitude of the metapole. Set to zero if you only want to change the midmeridian.
* @param {number} f0 Latitude of the metapole. Set to 90 if you only want to change the midmeridian.
* @param {number} lm Metalongitude of the midmeridian.
* @param {string} rotName SRS of the new, rotated projection.
* @param {string} metaName SRS of the created metagraticule.
* @return {ol.proj.Projection} Object for the rotated projection.
* @api
*/
ol.proj.rotateProjection = function (projection, l0, f0, lm, rotName, metaName) {
	var meta = new ol.proj.Projection({
		code: metaName,
		units: 'degrees'
	});
	if (!ol.proj.get(metaName)) {
		ol.proj.addProjection(meta);
	}
	ol.proj.addCoordinateTransforms('EPSG:4326', metaName, function(point) {
		return ol.cut.rotate(point, l0, f0, lm);
	}, function(point) {
		return ol.cut.rotate(point, 180 - lm, f0, 180 - l0);
	});
	var orig = ol.proj.get(projection);
	var rotated = new ol.proj.Projection({
		code: rotName,
		units: orig.getUnits(),
		extent: orig.getExtent(),
		global: orig.isGlobal()
	});
	if (!ol.proj.get(rotName)) {
		ol.proj.addProjection(rotated);
	}
	ol.proj.addCoordinateTransforms(metaName, rotName, function(point) {
		return ol.proj.fromLonLat(point, orig);
	}, function(point) {
		return ol.proj.toLonLat(point, orig);
	});
	ol.proj.addCoordinateTransforms('EPSG:4326', rotName, function(point) {
		return ol.proj.fromLonLat(ol.cut.rotate(point, l0, f0, lm), orig);
	}, function(point) {
		return ol.cut.rotate(ol.proj.toLonLat(point, orig), 180 - lm, f0, 180 - l0);
	});
	return rotated;
};

/**
* Acts as readFeature() but cuts features at antimeridian and optional other arbitary lines.
* @param {Document|Node|Object|string} source Source.
* @param {olx.format.ReadOptions=} opt_options Read options.
* @param {ol.proj.ProjectionLike|undefined} opt_metaName SRS of the metagraticule created with ol.proj.rotateProjection.
* Required when the destination projection is in oblique aspect or the midmeridian is not Greenwich. Default EPSG:4326.
* If used, please set featureProjection in the read options to the projection created with ol.proj.rotateProjection.
* @param {boolean|undefined} opt_azimuthal If true, cut will not preform at the antimeridian, only at the antipode.
* Default is false. Only set true for azimuthal projections (eg. Lambert Azimuthal or Berghaus star).
* @param {Array.<ol.cut.CutLine>|undefined} opt_cutLines If the projection has additional boundary cuts following any metagraticule line
* (eg. Goode or Berghaus), specify them here. Antimeridian and pole line cuts are automatic, must not be included. Default: empty array.
* @return {Array.<ol.Feature>} Features.
* @api
*/
ol.format.Feature.prototype.readCutFeatures = function(source, opt_options, opt_metaName, opt_azimuthal, opt_cutLines) {
	if (typeof opt_options === 'undefined') {
		opt_options = {};
	}
	if (typeof opt_cutLines === 'undefined') {
		opt_cutLines = [];
	}
	if (!opt_azimuthal) {
		opt_cutLines.unshift({type: 'parallel', deg: -90, from: -180, to: 180});
		opt_cutLines.unshift({type: 'parallel', deg: 90, from: -180, to: 180});
		opt_cutLines.unshift({type: 'meridian', deg: 180, from: -90, to: 90});
	} else {
		opt_cutLines.push({type: 'parallel', deg: -90, from: -180, to: 180});
	}
	var e = 1e-6//((opt_azimuthal && opt_cutLines.length == 1) || (!opt_azimuthal && opt_cutLines.length == 3)) ? 0 : 1e-4;
	var dest = opt_options.featureProjection || 'EPSG:4326';
	opt_options.featureProjection = 'EPSG:4326';
	var features = this.readFeatures(source, opt_options);
	for (var i = 0; i < features.length; i++) {
		var geom = features[i].getGeometry();
		geom.clockwiseGeometry();
		geom.transform('EPSG:4326', opt_metaName || 'EPSG:4326');
		for (var j = 0; j < opt_cutLines.length; j++) {
			geom = geom.cut(opt_cutLines[j], e);
		}
		features[i].setGeometry(geom.transform(opt_metaName || 'EPSG:4326', dest));
	}
	if (!opt_azimuthal) {
		opt_cutLines.shift();
		opt_cutLines.shift();
		opt_cutLines.shift();
	} else {
		opt_cutLines.pop();
	}
	return features;
};

/**
* None of any functions or variables in this namespace
* are meant to be called directly.
*
* @namespace ol.cut
*/
ol.cut = {};

/**
* Cut line. 
* Type can be either 'parallel' or 'meridian'.
* Deg is the metalatitude / metalongitude of the line.
* Cut line starts at from, and ends at to. From must be less than to.
* @typedef {{type: string, deg: number, from: number, to: number}} ol.cut.CutLine
* @api
*/
ol.cut.CutLine;

/**
* Intersection point of geodetic between pointA, pointB (given in spherical coords) and graticule line of cutLine.
* @param {ol.Coordinate} pointA
* @param {ol.Coordinate} pointB
* @param {ol.cut.CutLine} cutLine
* @return {ol.Coordinate}
*/
ol.cut.intersect = function (pointA, pointB, cutLine) {
	// Convert to radians
	var a = [pointA[0] / 180 * Math.PI, pointA[1] / 180 * Math.PI];
	var b = [pointB[0] / 180 * Math.PI, pointB[1] / 180 * Math.PI];
	var s = Math.acos(Math.sin(a[1]) * Math.sin(b[1]) + Math.cos(a[1]) * Math.cos(b[1]) * Math.cos(b[0] - a[0]));
	var x = Math.acos((Math.sin(a[1]) - Math.sin(b[1]) * Math.cos(s)) / (Math.cos(b[1]) * Math.sin(s)));
	if (cutLine.type == 'meridian') {
		var l = cutLine.deg / 180 * Math.PI;
		if (Math.abs(a[0] - l) <= 1e-4) {
			var f = a[1];
		} else if (Math.abs(b[0] - l) <= 1e-4) {
			var f = b[1];
		} else if (Math.PI / 2 - Math.abs(a[1]) <= 1e-6) {
			var f = a[1];
		} else if (Math.PI / 2 - Math.abs(b[1]) <= 1e-6) {
			var f = b[1];
		} else {
			var f = Math.atan((Math.sin(b[1]) * Math.cos(b[0] - l) + Math.abs(Math.sin(b[0] - l)) / Math.tan(x)) / Math.cos(b[1]));
		}
		return [cutLine.deg, f / Math.PI * 180];
	} else if (cutLine.type == 'parallel') {
		var f = cutLine.deg / 180 * Math.PI;
		if (Math.abs(f) == Math.PI / 2) {
			if (Math.abs(Math.abs(a[1]) - Math.PI / 2) <= 1e-6) {
				var l = b[0] + Math.PI / 2
			} else if (Math.abs(Math.abs(b[1]) - Math.PI / 2) <= 1e-6) {
				var l = a[0] + Math.PI / 2
			} else {
				var l = (a[0] + b[0]) / 2;
			}
			if (l > Math.PI / 2) {
				l-= Math.PI;
			}
		} else if (Math.abs(a[0] - b[0]) <= 1e-6) {
			if (Math.abs(a[1]) < Math.abs(b[1])) {
				var l = a[0];
			} else {
				var l = a[0];
			}
		} else {
			if (Math.abs(f + b[1]) <= 1e-6) {
				var l = -2 * Math.atan(Math.tan(x) * Math.sin(b[1]));
			} else {
				var l = 2 * Math.atan((1 / Math.tan(x) -
					(a[1] > b[1] ? 1 : -1) * Math.sqrt(Math.pow(Math.tan(x), -2) - Math.pow(Math.cos(b[1]) * Math.tan(f), 2) +
					Math.pow(Math.sin(b[1]), 2))) / (Math.cos(b[1]) * Math.tan(f) + Math.sin(b[1])));
			}
			l = b[0] - (Math.sin(b[0] - a[0]) > 0 ? 1 : -1) * l;
			while (Math.abs(l) > Math.PI) {
				l -= (l > 0 ? 1 : -1) * 2 * Math.PI;
			}
		}
		return [l / Math.PI * 180, cutLine.deg];		
	} else {
		throw 'Invalid cutLine type';
	}
};

/**
* Decide if geodetic between pointA and pointB intersects with cutLine.
* @param {ol.Coordinate} pointA
* @param {ol.Coordinate} pointB
* @param {ol.cut.CutLine} cutLine
* @return {boolean}
*/
ol.cut.hasIntersect = function (pointA, pointB, cutLine) {
	if (cutLine.type == 'meridian') {
		if (Math.abs(cutLine.deg) == 180) {
			return Math.abs(pointA[0] - pointB[0]) > 180;
		} else {
			return ((pointA[0] < cutLine.deg) != (pointB[0] < cutLine.deg)) && (Math.abs(pointA[0] - pointB[0]) < 180);
		}
	} else if (cutLine.type == 'parallel') {
		if (Math.abs(cutLine.deg) == 90) {
			return (Math.abs(Math.abs(pointA[0] - pointB[0]) - 180) < (180 - 180 * Math.sqrt((90 - Math.abs(pointA[1])) * (90 - Math.abs(pointB[1]))))) && ((pointA[1] + pointB[1] > 0) ^ (cutLine.deg < 0));
		} else {
			return (pointA[1] < cutLine.deg) != (pointB[1] < cutLine.deg);
		}
	} else {
		throw 'Invalid cutLine type';
	}
};

/**
* Decide if intersection point is between the from and to of cutLine
* @param {ol.Coordinate} point
* @param {ol.cut.CutLine} cutLine
* @return {boolean}
*/
ol.cut.intersectBetween = function (point, cutLine) {
	if (cutLine.type == 'meridian') {
		return point[1] >= cutLine.from && point[1] <= cutLine.to;
	} else if (cutLine.type == 'parallel') {
		return point[0] >= cutLine.from && point[0] <= cutLine.to;
	} else {
		throw 'Invalid cutLine type';
	}	
};

/**
* Moves a point if too close to cut line. Otherwise it keeps in place.
* @param {ol.Coordinate} point
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
* @return {ol.Coordinate}
*/
ol.cut.move = function (point, cutLine, e) {
	if (!ol.cut.intersectBetween(point, cutLine)) return point;
	if (cutLine.type == 'meridian') {
		if (Math.abs(cutLine.deg) == 180) {
			return Math.abs(point[0]) > 180 - e ? [(point[0] > 0 ? 1 : -1) * (180 - e), point[1]] : point;
		} else {
			return Math.abs(point[0] - cutLine.deg) < e ? [cutLine.deg + (point[0] >= cutLine.deg ? 1 : -1) * e, point[1]] : point;
		}
	} else if (cutLine.type == 'parallel') {
		return Math.abs(point[1] - cutLine.deg) < e ? [point[0], cutLine.deg + (point[1] >= cutLine.deg && cutLine.deg < 90 ? 1 : -1) * e] : point;
	} else {
		throw 'Invalid cutLine type';
	}
};

/**
* Moves intersection point away from cutLine. Moving direction towards neighborPoint.
* @param {ol.Coordinate} point
* @param {ol.Coordinate} neighborPoint
* @param {ol.cut.CutLine} cutLine
* @param {number} e Distance from cut line (degrees)
* @return {ol.Coordinate}
*/
ol.cut.moveIntersection = function (point, neighborPoint, cutLine, e) {
	if (cutLine.type == 'meridian') {
		if (Math.abs(cutLine.deg) == 180) {
			return [(neighborPoint[0] > 0 ? 1 : -1) * (180 - e), point[1]];
		} else {
			return [cutLine.deg + (neighborPoint[0] >= cutLine.deg ? 1 : -1) * e, point[1]];
		}
	} else if (cutLine.type == 'parallel') {
		if (Math.abs(cutLine.deg) == 90) {
			return [/*point[0] + (point[0] <*/ neighborPoint[0]/* ? 90 : -90)*/, cutLine.deg + (cutLine.deg < 0 ? 1 : -1) * e];
		} else {
			return [point[0], cutLine.deg + (neighborPoint[1] >= cutLine.deg ? 1 : -1) * e];
		}
	} else {
		throw 'Invalid cutLine type';
	}
};

/**
* Oblique aspect transformation.
* @param {ol.Coordinate} point
* @param {number} l0 Longitude of the metapole.
* @param {number} f0 Latitude of the metapole.
* @param {number} lm Metalongitude of the midmeridian.
* @return {ol.Coordinate}
*/
ol.cut.rotate = function (point, l0, f0, lm) {
	point = [point[0] * Math.PI / 180, point[1] * Math.PI / 180];
	l0 *= Math.PI / 180;
	f0 *= Math.PI / 180;
	lm *= Math.PI / 180;
	if (l0 != 0) {
		point[0] -= l0;
	}
	if (Math.sin(f0) == -1) {
		point[1] *= -1;
		point[0] *= -1;
		point[0] += point[0] > 0 ? -Math.PI : Math.PI;
	} else if (Math.sin(f0) < 1) {
		point = [
			Math.atan2(Math.cos(point[1]) * Math.sin(point[0]), -Math.cos(f0) * Math.sin(point[1]) + Math.sin(f0) * Math.cos(point[1]) * Math.cos(point[0])),
			Math.asin(Math.sin(f0) * Math.sin(point[1]) + Math.cos(f0) * Math.cos(point[1]) * Math.cos(point[0]))
		];
	}
	if (lm != 0) {
		point[0] -= lm;
	}
	while (Math.abs(point[0]) > Math.PI && (l0 != 0 || lm != 0)) {
		point[0] -= (point[0] > 0 ? 1 : -1) * 2 * Math.PI;
	}
	return [point[0] * 180 / Math.PI, point[1] * 180 / Math.PI];
};

/**
* Which side of cutLine?
* @param {ol.Coordinate} point
* @param {ol.cut.CutLine} cutLine
* @return {number} -1 or 1
*/
ol.cut.side = function(point, cutLine) {
	if (cutLine.deg == 180) {
		return point[0] > 0 ? 1 : -1;
	} else {
		var side = point[cutLine.type == 'parallel' ? 1 : 0] < cutLine.deg || (cutLine.type == 'parallel' && cutLine.deg == 90) ? -1 : 1;
		return side * (cutLine.type == 'meridian' ? -1 : 1);
	}
}

/**
* Orders line strings by endpoints.
* @param {Array.<Array.<ol.Coordinate>>} lineStrings Line strings to order.
* @param {ol.cut.CutLine} cutLine
* @return {{start: Array.<Array.<ol.Coordinate>>, end: Array.<Array.<ol.Coordinate>>}} Ordered by start and endpoints.
*/
ol.cut.orderLineStrings = function(lineStrings, cutLine) {
	var out = {
		start: lineStrings.slice(0),
		end: lineStrings.slice(0)
	};
	var sort = function (a, b) {
		var acoord = a[start ? 0 : a.length - 1];
		var bcoord = b[start ? 0 : b.length - 1];
		return sort2(acoord, bcoord);
	};
	var sort2 = function(acoord, bcoord) {
		var aval = acoord[cutLine.type == 'meridian' ? 1 : 0];
		var bval = bcoord[cutLine.type == 'meridian' ? 1 : 0];
		aval = ol.cut.side(acoord, cutLine) == 1 ? 400 - aval : aval;
		bval = ol.cut.side(bcoord, cutLine) == 1 ? 400 - bval : bval;
		return aval - bval;
	}
	var start = true;
	out.start.sort(sort);
	start = false;
	out.end.sort(sort);
	if (sort2(out.start[0][0], out.end[0][out.end[0].length - 1]) < 0) {
		if (cutLine.from == -180 && cutLine.to == 180 && Math.abs(cutLine.deg) < 90 && out.start.length > 1) {
			var i = 0;
			var last = out.start.shift();
			var lside = ol.cut.side(last[0], cutLine);
			while (i != out.start.length && lside == ol.cut.side(out.start[i][0], cutLine)) {
				i++;
			}
			if (i != out.start.length) {
				out.start.splice(i, 0, last);
				out.start.push(out.start.splice(i + 1, 1)[0]);
			}
		} else {
			out.start.push(out.start.shift());
		}
	}
	return out;
};

/**
* Connects two line segments. Modifies original arrays! If a == b, closes ring.
* @param {Array.<Array.<ol.Coordinate>>} a
* @param {Array.<Array.<ol.Coordinate>>} b
* @param {ol.cut.CutLine} cutLine
* @return {Array.<Array.<ol.Coordinate>>}
*/
ol.cut.connectSegments = function(a, b, cutLine) {
	var start = a[a.length - 1];
	var end = b[0];
	var addPoints = function(a, b, interval, xy, deg, arr) {
		for (var i = 1; i < Math.round(Math.abs(b - a) / interval); i++) {
			var point = [];
			point[xy] = a + i * (b - a) / Math.round(Math.abs(b - a) / interval);
			if (point[xy] > 180) {
				point[xy] -= 360;
			}
			point[-(xy - 1)] = deg;
			arr.push(point);
		}
	};
	var INT = .5;
	var xy = cutLine.type == 'parallel' ? 0 : 1;
	var aside = ol.cut.side(start, cutLine);
	var bside = ol.cut.side(end, cutLine);
	if (cutLine.from == -180 && cutLine.to == 180 && aside != bside)
	{
		alert();
		console.log(a, b);
	}
	if (cutLine.from == -180 && cutLine.to == 180 && aside * start[xy] < aside * end[xy] - 1e-4) {
		addPoints(start[xy] + (aside == -1 ? 0 : 360), end[xy] + (aside == 1 ? 0 : 360), INT, xy, start[-(xy - 1)], a);
	} else if (aside == bside) {
		addPoints(start[xy], end[xy], INT, xy, start[-(xy - 1)], a);
	} else if (aside == -1) {
		addPoints(start[xy], cutLine.to, INT, xy, start[-(xy - 1)], a);
		var point = [];
		point[xy] = cutLine.to;
		point[-(xy - 1)] = start[-(xy - 1)];
		a.push(point);
		point = [];
		point[xy] = cutLine.to;
		point[-(xy - 1)] = end[-(xy - 1)];
		a.push(point);
		addPoints(cutLine.to, end[xy], INT, xy, end[-(xy - 1)], a);
	} else {
		addPoints(start[xy], cutLine.from, INT, xy, start[-(xy - 1)], a);
		var point = [];
		point[xy] = cutLine.from;
		point[-(xy - 1)] = start[-(xy - 1)];
		a.push(point);
		point = [];
		point[xy] = cutLine.from;
		point[-(xy - 1)] = end[-(xy - 1)];
		a.push(point);
		addPoints(cutLine.from, end[xy], INT, xy, end[-(xy - 1)], a);
	}
	if (a == b) {
		a.push(a[0]);
		return a;
	} else {
		a.push.apply(a, b);
		b = a;
		return a;
	}
};

/**
* Check if a hole is in a linear ring. (Bbox test.)
* @param {Array.<ol.Coordinate>} hole
* @param {Array.<ol.Coordinate>} ring
* @return {boolean}
*/
ol.cut.holeInRing = function(hole, ring) {
	var min = function(arr, ind) {
		var ret = Infinity;
		for (var i = 0; i < arr.length; i++) {
			if (arr[i][ind] < ret) {
				ret = arr[i][ind];
			}
		}
		return ret;
	};
	var max = function(arr, ind) {
		var ret = -Infinity;
		for (var i = 0; i < arr.length; i++) {
			if (arr[i][ind] > ret) {
				ret = arr[i][ind];
			}
		}
		return ret;
	};
	if (min(hole, 0) >= min(ring, 0) && min(hole, 1) >= min(ring, 1) && max(hole, 0) <= max(ring, 0) && max(hole, 1) <= max(ring, 1)) {
		return true;
	}
	return false;
}

/**
* Adds a point to a linestring. Modifies original array.
* @param {Array.<ol.Coordinate>} lineString
* @param {ol.Coordinate} point
* @param {ol.cut.CutLine} cutLine
*/
ol.cut.addPoint = function(lineString, point, cutLine) {
	if (lineString.length == 0 ||
	((cutLine.type != 'parallel' || Math.abs(cutLine.deg) < 90 || lineString[lineString.length - 1][1] + point[1] != 2 * cutLine.deg) &&
	(lineString[lineString.length - 1][0] != point[0] ||
	lineString[lineString.length - 1][1] != point[1]))) {
		lineString.push(point);
	}
}


/**
* Cuts a line string into pieces.
* @param {Array.<ol.Coordinate>} lineString
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
* @return {Array.<Array.<ol.Coordinate>>}
*/
ol.cut.cutLineString = function (lineString, cutLine, e) {
	var out = [];
	var stack = [];
	for (var i = 1; i < lineString.length; i++) {
		ol.cut.addPoint(stack, ol.cut.move(lineString[i - 1], cutLine, e), cutLine);
		if (ol.cut.hasIntersect(lineString[i - 1], lineString[i], cutLine)) {
			var intPoint = ol.cut.intersect(lineString[i - 1], lineString[i], cutLine);
			if (ol.cut.intersectBetween(intPoint, cutLine)) {
				ol.cut.addPoint(stack, ol.cut.moveIntersection(intPoint, lineString[i - 1], cutLine, e), cutLine);
				if (stack.length > 1 || out.length == 0) {
					out.push(stack);
				}
				stack = [ol.cut.moveIntersection(intPoint, lineString[i], cutLine, e)];
			}
		}
	}
	ol.cut.addPoint(stack, ol.cut.move(lineString[i - 1], cutLine, e), cutLine);
	out.push(stack);
	if (out.length > 0) {
		return out;
	} else {
		return [lineString];
	}
};

/**
* Cuts a polygon into pieces.
* @param {Array.<Array.<ol.Coordinate>>} polygon
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
* @return {Array.<Array.<Array.<ol.Coordinate>>>}
*/
ol.cut.cutPolygon = function (polygon, cutLine, e) {
	var segments = ol.cut.cutLineString(polygon[0], cutLine, e);
	if (segments.length == 1) {
		if (cutLine.from == -180 && cutLine.to == 180 && Math.abs(cutLine.deg) == 90) {
			polygon = ol.cut.cutPole(polygon, cutLine, e);
			// if (getArea(polygon[0]) < 1e-8)
			//	console.log(getArea(polygon[0]));
		}
		return [polygon];
	}
	segments[0].shift();
	segments[0] = segments[segments.length - 1].concat(segments[0]);
	segments.pop();
	var holes = [];
	var rings = [];
	for (var i = 1; i < polygon.length; i++) {
		var temp = ol.cut.cutLineString(polygon[i], cutLine, e);
		if (temp.length == 1) {
			holes.push(temp[0]);
		} else {
			temp[0].shift();
			temp[0] = temp[temp.length - 1].concat(temp[0]);
			temp.pop();
			segments = segments.concat(temp);
		}
	}
	for (var i = 0; i < segments.length; i++) {
		if (segments[i].length <= 4) {
			segments.splice(i, 1);
			i--;
		}
	}
	if (segments.length == 0)
	{
		return [[[[0, 0], [0, 0]]]];
	}
	var sorted = ol.cut.orderLineStrings(segments, cutLine);
	for (var i = 0; i < segments.length; i++) {
		var con = ol.cut.connectSegments(sorted.end[i], sorted.start[i], cutLine);
		if (con[0] == con[con.length - 1]) {
			rings.push([con]);
		} else {
			sorted.end[sorted.end.indexOf(sorted.start[i])] = sorted.end[i];
		}
	}
	for (var i = 0; i < holes.length; i++) {
		var j = 0;
		while(j < rings.length && !ol.cut.holeInRing(holes[i], rings[j][0])) {
			j++;
		}
		if (j == rings.length) {
			j = 0;
			//alert();
		}
		rings[j].push(holes[i]);
	}
	return rings;
};

/**
* Cuts a polygon with pole line.
* @param {Array.<Array.<ol.Coordinate>>} polygon
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
* @return {Array.<Array.<ol.Coordinate>>}
*/
ol.cut.cutPole = function (polygon, cutLine, e) {
	var pole = 0;
	for (var i = 0; i < polygon[0].length - 1; i++) {
		if (polygon[0][i][0] - polygon[0][i + 1][0] > 180) {
			pole -= 1;
		}
		if (polygon[0][i][0] - polygon[0][i + 1][0] < -180) {
			pole += 1;
		}
	}
	if (pole == 0 || (pole < 0) != (cutLine.deg < 0) || polygon[0][0][1] == -cutLine.deg) {
		return polygon;
	}
	for (var j = 1; j < polygon.length; j++) {
		for (var i = 0; i < polygon[j].length - 1; i++) {
			if (polygon[j][i][0] - polygon[j][i + 1][0] > 180) {
				pole -= 1;
			}
			if (polygon[j][i][0] - polygon[j][i + 1][0] < -180) {
				pole += 1;
			}
		}
		if (pole == 0) {
			polygon.unshift(polygon.splice(j, 1)[0]);
			polygon[0] = ol.cut.cutPolygon([polygon[0]], cutLine, e)[0][0];
			return polygon;
		}
	}
	var line = ol.cut.connectSegments([[0, cutLine.deg]], [[pole * 180, cutLine.deg]], cutLine);
	line.pop();
	line = line.concat(ol.cut.connectSegments([[pole * -180, cutLine.deg]], [[0, cutLine.deg]], cutLine));
	polygon.unshift(line);
	return polygon;
}
/**
* Returns rings clockwise. Modifies original array.
* @param {Array.<Array.<ol.Coordinate>>} polygon
*/
ol.cut.clockwise = function (polygon) {
	//return polygon;
	var max = -Infinity;
	var biggest = 0;
	var areas = [];
	// Approximates area of ring in steradians supposing area is less than hemisphere
	function getArea(ring) {
		var ret = 0;
		var dlsum = 0;
		for (var i = 0; i < ring.length - 1; i++) {
			var dl = ring[i + 1][0] - ring[i == 0 ? ring.length - 2 : i - 1][0];
			if (Math.abs(dl) > 180) {
				dl = (360 - Math.abs(dl)) * (dl > 0 ? -1 : 1);
			}
			ret += dl * Math.PI / 180 * Math.sin(ring[i][1] * Math.PI / 180);
			dlsum += dl;
		}
		if (Math.abs(dlsum) > 180)
		{
			ret += 4 * Math.PI;
		}
		if (Math.abs(ret) > 4 * Math.PI)
		{
			ret += (ret > 0 ? -8 : 8) * Math.PI;
		}
		return ret / 2;
	}
	for (var i = 0; i < polygon.length; i++) {
		areas[i] = getArea(polygon[i]);
		if (Math.abs(areas[i]) < 1e-12) {
			//Remove silver polygons!
			areas.pop();
			polygon.splice(i, 1);
			i--;
		} else if (Math.abs(areas[i]) > max) {
			max = Math.abs(areas[i]);
			biggest = i;
		}
	}
	if (polygon.length == 0) {
		return [[[0, 0], [0, 0]]];
	}
	if (biggest > 0) {
		polygon.unshift(polygon.splice(biggest, 1));
		areas.unshift(areas.splice(biggest, 1));
	}
	for (var i = 0; i < polygon.length; i++) {
		if ((areas[i] > 0) == (i > 0)) {
			console.log(polygon[i]); alert(areas[i]);
			polygon[i].reverse();
		}
	}
	return polygon;
};

ol.geom.Geometry.prototype.cut = function () {return this;};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.Point.prototype.cut = function (cutLine, e) {
	this.setCoordinates(ol.cut.move(this.getCoordinates(), cutLine, e));
	return this;
};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.Circle.prototype.cut = function (cutLine, e) {
	this.setCenter(ol.cut.move(this.getCenter(), cutLine, e));
	return this;
};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.MultiPoint.prototype.cut = function (cutLine, e) {
	var inp = this.getCoordinates();
	var out = [];
	for (var i = 0; i < inp.length; i++) {
		out.push(ol.cut.move(inp[i], cutLine, e));
	}
	this.setCoordinates(out);
	return this;
};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.LineString.prototype.cut = function (cutLine, e) {
	var out = ol.cut.cutLineString(this.getCoordinates(), cutLine, e);
	if (out.length == 1) {
		this.setCoordinates(out[0]);
		return this;
	} else {
		return new ol.geom.MultiLineString(out);
	}
};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.MultiLineString.prototype.cut = function (cutLine, e) {
	var inp = this.getCoordinates();
	var out = [];
	for (var i = 0; i < inp.length; i++) {
		var stack = ol.cut.cutLineString(inp[i], cutLine, e);
		for (var j = 0; j < stack.length; j++) {
			out.push(stack[j]);
		}
	}
	this.setCoordinates(out);
	return this;
};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.Polygon.prototype.cut = function (cutLine, e) {
	var out = ol.cut.cutPolygon(this.getCoordinates(), cutLine, e);
	if (out.length == 1) {
		this.setCoordinates(out[0]);
		return this;
	} else {
		return new ol.geom.MultiPolygon(out);
	}
};

/**
* Cuts geometry with cutLine. Modifies geometry in place. clone() it before, if original needs to be preserved.
* @param {ol.cut.CutLine} cutLine
* @param {number} e Minimum distance from cut line (degrees)
*/
ol.geom.MultiPolygon.prototype.cut = function (cutLine, e) {
	var inp = this.getCoordinates();
	var out = [];
	for (var i = 0; i < inp.length; i++) {
		var stack = ol.cut.cutPolygon(inp[i], cutLine, e);
		for (var j = 0; j < stack.length; j++) {
			out.push(stack[j]);
		}
	}
	this.setCoordinates(out);
	return this;
};

ol.geom.Geometry.prototype.clockwiseGeometry = function () {};

/**
* Sets exterior ring clockwise, interiors counterclockwise.
*/
ol.geom.Polygon.prototype.clockwiseGeometry = function() {
	this.setCoordinates(ol.cut.clockwise(this.getCoordinates()));
};

/**
* Sets exterior ring clockwise, interiors counterclockwise.
*/
ol.geom.MultiPolygon.prototype.clockwiseGeometry = function() {
	var inp = this.getCoordinates();
	var out = [];
	for (var i = 0; i < inp.length; i++) {
		out[i] = ol.cut.clockwise(inp[i]);
	}
	this.setCoordinates(out);
};