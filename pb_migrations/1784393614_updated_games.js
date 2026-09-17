/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_879072730")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  // remove field
  collection.fields.removeById("text3794590758")

  // add field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "select258142582",
    "maxSelect": 0,
    "name": "region",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "NTSC-U",
      "NTSC-J",
      "PAL"
    ]
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text2203071480",
    "max": 0,
    "min": 0,
    "name": "genre",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1710984090",
    "max": 0,
    "min": 0,
    "name": "developer",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text2632504646",
    "max": 0,
    "min": 0,
    "name": "publisher",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "help": "",
    "hidden": false,
    "id": "date2655453981",
    "max": "",
    "min": "",
    "name": "release",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "help": "",
    "hidden": false,
    "id": "file484410058",
    "maxSelect": 0,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "cover_image",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "help": "",
    "hidden": false,
    "id": "json2698072953",
    "maxSize": 0,
    "name": "languages",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1843675174",
    "max": 0,
    "min": 0,
    "name": "description",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1832080413",
    "max": 0,
    "min": 0,
    "name": "manufacturer_description",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "file445458195",
    "maxSelect": 10,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "screenshots",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "json3217087507",
    "maxSize": 0,
    "name": "features",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text642663334",
    "max": 0,
    "min": 0,
    "name": "players",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_879072730")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_ymkfmtwgn3` ON `games` (`serial`)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text3794590758",
    "max": 0,
    "min": 0,
    "name": "serial",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("select258142582")

  // remove field
  collection.fields.removeById("text2203071480")

  // remove field
  collection.fields.removeById("text1710984090")

  // remove field
  collection.fields.removeById("text2632504646")

  // remove field
  collection.fields.removeById("date2655453981")

  // remove field
  collection.fields.removeById("file484410058")

  // remove field
  collection.fields.removeById("json2698072953")

  // remove field
  collection.fields.removeById("text1843675174")

  // remove field
  collection.fields.removeById("text1832080413")

  // remove field
  collection.fields.removeById("file445458195")

  // remove field
  collection.fields.removeById("json3217087507")

  // remove field
  collection.fields.removeById("text642663334")

  return app.save(collection)
})
