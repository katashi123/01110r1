(function() {
    let vfs = window.vfs;
    let path = window._NODE_PATH;

    const builtin = {
        "fs": {
            readFileSync(sPath, encoding) {
                if (sPath.startsWith("www/")) {
                    sPath = "/" + sPath;
                }
                if (sPath.startsWith("/www/img") || sPath.startsWith("/www/audio")) {
                    return Buffer.alloc(0);
                }
                console.log(sPath);
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }
                let data = Buffer.from(vfs.readSync(sPath));

                if (encoding) {
                    if (typeof encoding === "object") {
                        encoding = encoding.encoding;
                    }
                    data = data.toString(encoding);
                }

                return data;
            },
            readFile() {
                let sPath, encoding, callback;
                if (arguments.length === 2) {
                    [sPath, callback] = arguments;
                }
                if (arguments.length === 3) {
                    [sPath, encoding, callback] = arguments;
                }

                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                vfs.read(sPath).then(data => {
                    if (encoding) {
                        data = data.toString(encoding);
                    }
                    callback(null, data)
                }).catch(error => {
                    callback(error);
                })
            },
            readdir(sPath, callback) {
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                let results = vfs.readdir(sPath);

                callback(null, results);
            },
            readdirSync(sPath) {
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                console.log(sPath, vfs.readdir(sPath));
                return vfs.readdir(sPath);
            },
            existsSync(sPath) {
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                return vfs.exists(sPath);
            },
            statSync(sPath) {
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                return vfs.stat(sPath);
            },
            lstatSync(sPath) {
                if (sPath.startsWith("www/")) {
                    sPath = "/" + sPath;
                }
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                return vfs.stat(sPath);
            },
            mkdirSync(sPath) {
                if (sPath.startsWith("www/")) {
                    sPath = "/" + sPath;
                }
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                vfs.mkdir(sPath);
            },
            writeFileSync(sPath, data) {
                if (typeof data === "number") data = data.toString();
                if (sPath.startsWith("www/")) {
                    sPath = "/" + sPath;
                }
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                vfs.write(sPath, Buffer.from(data));
            },
            writeFile(sPath, data, callback) {
                if (typeof data === "number") data = data.toString();
                if (sPath.startsWith("www/")) {
                    sPath = "/" + sPath;
                }
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                if (typeof data === "number") {
                    data = data.toString();
                }

                console.log(sPath, data);
                vfs.write(sPath, Buffer.from(data));
                callback(null);
            },
            unlinkSync(sPath) {
                if (!path.isAbsolute(sPath)) {
                    sPath = path.resolve(process.cwd(), sPath);
                }

                vfs.delete(sPath);
            }
        },
        "path": window._NODE_PATH,
        "crypto": {
            createDecipheriv() {
                class FakeCrypto {
                    constructor() {}
                    update(d) {
                        return d;
                    }
                    final() {
                        return Buffer.alloc(0);
                    }
                }

                return new FakeCrypto();
            },
            createCipheriv() {
                class FakeCrypto {
                    constructor() {}
                    update(d) {
                        return d;
                    }
                    final() {
                        return Buffer.alloc(0);
                    }
                }

                return new FakeCrypto();
            },
        },
        "os": {
            platform() {
                return "windows";
            }
        },
        "nw.gui": {
            Window: {
                get() {
                    return {
                        menu: null,
                        on(){}
                    }
                },
                on(){}
            },
            Screen: {
                Init() {},
                on() {}
            }
        }
    }

    window.navigator.plugins.namedItem = function() { return null; }

    function requireFactory(base) {
        function newRequire(url) {
            if (builtin[url])
                return builtin[url];
            else {
                let f = path.join(base, url);
                
                let reqFile = f;
                try {
                    if (vfs.stat(reqFile).isDirectory()) {
                        // read package.json
                        try {
                            let package = JSON.parse(Buffer.from(vfs.readSync(path.join(reqFile, "package.json"))).toString("utf-8"));
                            if (package.main) reqFile = path.join(reqFile, package.main);
                            else reqFile = path.join(reqFile, "index.js");
                        } catch(e) {
                            if (vfs.exists(reqFile + ".js")) {
                                reqFile = reqFile + ".js";
                            } else {
                                reqFile = path.join(reqFile, "index.js");
                            }
                        }
                    }
                } catch(e) {
                    reqFile = reqFile + ".js";
                }
                let content = Buffer.from(vfs.readSync(reqFile)).toString("utf-8");
                let body = `(function imported(module, exports, require) {
                    ${content}
                })`;
                body = eval(body);
                let module = {
                    exports: {}
                }
                body(module, module.exports, requireFactory(path.dirname(reqFile)));

                return module.exports;
            }
        }

        return newRequire;
    }

    window.require = requireFactory("/www");
})();