Openlayers3 cut plugin
======================

How it works?
-------------

Read about the problem and the implementation in Kerkovits K: Handling Boundary Cuts while Reprojectig GIS Vector Data ([pages 351—360 in the Proceedings of the 6th ICC&GIS Conference](https://drive.google.com/file/d/0B0iHyURqv8Ncb3RVTFdJMHZEVDQ/view)). Needs Openlayers3 to use it.

API
---

```javascript
ol.proj.rotateProjection(projection, l0, f0, lm, rotName, metaName)
```

Rotates a projection to oblique aspect and registers transform functions between EPSG:4326 and the new projection.

**projection** *ol.proj.ProjectionLike* Original projection.
Transform function between EPSG:4326 and this projection must be defined earlier in either OpenLayers or proj4js.

**l0** *number* Longitude of the metapole. Set to zero if you only want to change the midmeridian.

**f0** *number* Latitude of the metapole. Set to 90 if you only want to change the midmeridian.

**lm** *number* Metalongitude of the midmeridian.

**rotName** *string* SRS of the new, rotated projection. (May be any arbitrary name.)

**metaName** *string* SRS of the created metagraticule. (May be any arbitrary name.)

**_return_** *ol.proj.Projection* Object for the rotated projection.
