Openlayers3 cut plugin
======================

How it works?
-------------

Read about the problem and the implementation in Kerkovits K: Handling Boundary Cuts while Reprojectig GIS Vector Data ([pages 351–360 in the Proceedings of the 6th ICC&GIS Conference](https://drive.google.com/file/d/0B0iHyURqv8Ncb3RVTFdJMHZEVDQ/view)). Needs Openlayers3 to use it.

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

```javascript
(new ol.format.Feature()).readCutFeatures(source, opt_options, opt_metaName, opt_azimuthal, opt_cutLines)
```
Acts as readFeature() but cuts features at antimeridian and optional other arbitary lines.

**source** *Document|Node|Object|string* Source.

**opt_options** *olx.format.ReadOptions*  Read options.

**opt_metaName** *ol.proj.ProjectionLike|undefined*  SRS of the metagraticule created with ol.proj.rotateProjection.
Required when the destination projection is in oblique aspect or the midmeridian is not Greenwich. Default EPSG:4326.
If used, please set featureProjection in the read options to the projection created with ol.proj.rotateProjection.

**opt_azimuthal** *boolean|undefined*  If true, cut will not preform at the antimeridian, only at the antipode.
Default is false. Only set true for azimuthal projections (eg. Lambert Azimuthal or Berghaus star).

**opt_cutLines** *Array.\<ol.cut.CutLine\>|undefined*  If the projection has additional boundary cuts following any metagraticule line
(eg. Goode or Berghaus), specify them here. Antimeridian and pole line cuts are automatic, must not be included. Default: empty array.

**_return_** *Array.\<ol.Feature\>* Features.

Examples
--------

TODO
