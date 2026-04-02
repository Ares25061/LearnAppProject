import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { escapeXml } from "@/lib/utils";

let assetPromise:
  | Promise<{
      adlcp: Buffer;
      imscp: Buffer;
      imsmd: Buffer;
      wrapper: Buffer;
    }>
  | null = null;

async function getAssets() {
  if (!assetPromise) {
    const appRoot = /* turbopackIgnore: true */ process.cwd();
    const templateDirectory = path.join(appRoot, "scorm-template");

    assetPromise = Promise.all([
      fs.readFile(path.join(templateDirectory, "adlcp_rootv1p2.xsd")),
      fs.readFile(path.join(templateDirectory, "imscp_rootv1p1p2.xsd")),
      fs.readFile(path.join(templateDirectory, "imsmd_rootv1p2p1.xsd")),
      fs.readFile(path.join(templateDirectory, "SCORM_API_wrapper.js")),
    ]).then(([adlcp, imscp, imsmd, wrapper]) => ({
      adlcp,
      imscp,
      imsmd,
      wrapper,
    }));
  }

  return assetPromise;
}

function buildIndexHtml(title: string, playUrl: string) {
  const safeTitle = title || "Название не указано";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(safeTitle)}</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: auto;
      font-family: Arial, sans-serif;
    }
  </style>
  <script src="SCORM_API_wrapper.js"></script>
  <script>
    var scorm = pipwerks.SCORM;

    function init() {
      scorm.init();
    }

    function end() {
      scorm.quit();
    }

    window.onload = function () {
      init();
    };

    window.onunload = function () {
      end();
    };

    var onmessage = function (e) {
      var a = e.data && e.data.split ? e.data.split("|") : [""];
      if (a[0] === "AppChecked" && parseInt(a[a.length - 1], 10) <= 2) {
        var value = parseInt(a[a.length - 2], 10);
        if (value > 0 && value <= 100 && a[a.length - 2].indexOf(";") === -1) {
          scorm.status("set", "completed");
          scorm.set("cmi.core.score.raw", value + "");
          scorm.set("cmi.core.score.min", "0");
          scorm.set("cmi.core.score.max", "100");
          scorm.set("cmi.core.score.scaled", "1");
          scorm.set("cmi.success_status", "passed");
          scorm.save();
        }
      }
      if (a[0] === "AppSolved" && parseInt(a[a.length - 1], 10) <= 2) {
        scorm.status("set", "completed");
        scorm.set("cmi.core.score.raw", a[2]);
        scorm.set("cmi.core.score.min", "0");
        scorm.set("cmi.core.score.max", "100");
        scorm.set("cmi.core.score.scaled", "1");
        scorm.set("cmi.success_status", "passed");
        scorm.save();
      }
    };

    if (typeof window.addEventListener !== "undefined") {
      window.addEventListener("message", onmessage, false);
    } else if (typeof window.attachEvent !== "undefined") {
      window.attachEvent("onmessage", onmessage);
    }
  </script>
</head>
<body>
  <div style="width: 100%; height: 100%; overflow: hidden;">
    <iframe
      id="frame"
      src="${escapeXml(playUrl)}"
      frameborder="0"
      width="100%"
      height="100%"
    ></iframe>
  </div>
</body>
</html>`;
}

function buildManifest(title: string) {
  const safeTitle = escapeXml(title || "Название не указано");

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="learningappsStudioSCORM12" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="LearningAppsStudio">
    <organization identifier="LearningAppsStudio" structure="hierarchical">
      <title>LearningApps Studio</title>
      <item identifier="LearningAppsStudioItem" isvisible="true" identifierref="LAFiles0">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="LAFiles0" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
      <file href="SCORM_API_wrapper.js" />
    </resource>
  </resources>
</manifest>`;
}

export async function generateScormArchive(input: {
  title: string;
  playUrl: string;
}) {
  const zip = new JSZip();
  const assets = await getAssets();
  const playUrl = input.playUrl.includes("?")
    ? `${input.playUrl}&fullscreen=1`
    : `${input.playUrl}?fullscreen=1`;

  zip.file("index.html", buildIndexHtml(input.title, playUrl));
  zip.file("imsmanifest.xml", buildManifest(input.title));
  zip.file("SCORM_API_wrapper.js", assets.wrapper);
  zip.file("adlcp_rootv1p2.xsd", assets.adlcp);
  zip.file("imscp_rootv1p1p2.xsd", assets.imscp);
  zip.file("imsmd_rootv1p2p1.xsd", assets.imsmd);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 9,
    },
  });
}
