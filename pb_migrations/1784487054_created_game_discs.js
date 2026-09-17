/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 0,
        "min": 0,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "help": "",
        "hidden": false,
        "id": "json724990059",
        "maxSize": 1,
        "name": "title",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "help": "",
        "hidden": false,
        "id": "_clone_zXiz",
        "maxSelect": 0,
        "maxSize": 1073741824,
        "mimeTypes": null,
        "name": "file",
        "presentable": false,
        "protected": false,
        "required": false,
        "system": false,
        "thumbs": null,
        "type": "file"
      }
    ],
    "id": "pbc_3254013153",
    "indexes": [],
    "listRule": "",
    "name": "game_discs",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "select discs.serial as id, (games.title || ' (Disc ' || (discs.\"index\"+1) || ')') AS title, discs.iso as file\nfrom games\njoin discs on games.id = discs.game",
    "viewRule": ""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3254013153");

  return app.delete(collection);
})
