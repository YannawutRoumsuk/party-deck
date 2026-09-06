// server/games/spyfall/locations-extra.js — สถานที่เพิ่มเติม (สร้างด้วยสคริปต์)
// generate จาก scripts/gen-packs.js ไม่ต้องแก้ด้วยมือ
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SpyfallExtra = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var LOCATIONS = [];
  return { LOCATIONS: LOCATIONS };
});
