(function() {
    const path = window._NODE_PATH;
    const Buffer = buffer.Buffer;

    class Stats {
        constructor(directory, size) {
            this.dir = directory;
            this.size = size;
        }

        isDirectory() {
            return this.dir;
        }

        isFile() {
            return !this.dir;
        }
    }

    class BasicFilesystem {
        constructor() {
            this.ident = "noop";
            this.writable = false;
            this.readable = false;
            this.sync = false;
        }

        init() {}

        exists(path) {
            throw new Error("Function unimplemented");
        }

        write(path, data) {
            throw new Error("Function unimplemented");
        }

        async read(path) {
            throw new Error("Function unimplemented");
        }

        readSync(path) {
            throw new Error("Function unimplemented");
        }

        stat(path) {
            throw new Error("Function unimplemented");
        }

        mkdir(path) {
            throw new Error("Function unimplemented");
        }

        readdir(path) {
            throw new Error("Function unimplemented");
        }

        ensureDirTree(path) {
            throw new Error("Function unimplemented");
        }
    }

    function splitPath(sPath) {
        let components = [];
        sPath = path.normalize(sPath);

        while(1) {
            let z = path.dirname(sPath);
            let component = sPath.replace(z, "");
            sPath = z;

            if (component.startsWith("/")) {
                component = component.split("/")[1];
            }
            components.unshift(component);

            if (z === "/") break;
        }

        return components;
    }

    function checkAbsolute(sPath) {
        if (!path.isAbsolute(sPath)) {
            throw new Error("path not absolute");
        }
    }

    class BasicWriteOnlyFileSystem extends BasicFilesystem {
        constructor() {
            super();
            this.ident = "protected";
            this.readable = false;
            this.writable = true;
            this.sync = true;
        }

        write() {}
        mkdir() {}
    }

    class BasicMemoryBackedFilesystem extends BasicFilesystem {
        constructor() {
            super();
            this.ident = "memfs";
            this.readable = true;
            this.writable = true;
            this.sync = true;
        }

        init() { 
            this.data = {}
        }

        _resolveEntity(path) {
            let elements = splitPath(path.toLowerCase());

            if (elements.length === 1 && elements[0] === "") { return { type: "dir", originalName: "", data: this.data }; }
            let current = this.data;
            for (let i = 0; i < (elements.length - 1); i++) {
                if (current[elements[i]] && current[elements[i]].type == "dir") {
                    current = current[elements[i]].data;
                } else {
                    throw new Error("Unable to resolve");
                }
            }

            if (current[elements[elements.length - 1]]) {
                current = current[elements[elements.length - 1]];
            } else {
                throw new Error("Unable to resolve");
            }

            return current;
        }

        exists(path) {
            try {
                this._resolveEntity(path);
                return true;
            } catch(e) {
                return false;
            }
        }

        write(sPath, data) {
            let { dir, base } = path.parse(sPath);

            let baseDir = this._resolveEntity(dir);
            baseDir.data[base.toLowerCase()] = {
                type: "file",
                data,
                originalName: base
            };
        }


        delete(sPath) {
            let { dir, base } = path.parse(sPath);

            try {
                let baseDir = this._resolveEntity(dir);
                baseDir.data[base] = undefined;
            } catch(e) {}
        }

        read( sPath ) {
            return this.readSync( sPath );
        }

        readSync( sPath ) {
            let entity = this._resolveEntity(sPath);
            if (entity.type === "file") {
                return entity.data;
            }
        }

        stat( sPath ) {
            let entity = this._resolveEntity(sPath);
            return new Stats(entity.type === "dir", entity.data.length);
        }

        mkdir( sPath ) {
            let { dir, base } = path.parse(sPath);

            let baseDir = this._resolveEntity(dir);
            if (!baseDir.data[base.toLowerCase()])
                baseDir.data[base.toLowerCase()] = {
                    type: "dir",
                    data: {},
                    originalName: base
                };
        }

        readdir( sPath ) {
            let b = this._resolveEntity( sPath );
            let elements = [];

            if (b.type !== "dir") {
                throw new Error("Not directory");
            }
            for (let key in b.data) {
                let e = b.data[key];
                elements.push(e.originalName);
            }

            return elements;
        }

        ensureDirTree( absPath ) {
            checkAbsolute(absPath);
            let comp = splitPath(absPath);
            
            let p = "/";
            for (let i = 0; i < comp.length; i++) {
                p = p + comp[i] + "/";
                if (!this.exists(p)) {
                    this.mkdir(p);
                }
            }
        }
    }

    function reportProgress(text) {
        let p = document.getElementById("progress-reporter");
        let t = p.innerText;
        t = t + text + "\n";

        p.innerText = t;
    }

    class SyncFromPackFilesystem extends BasicMemoryBackedFilesystem {
        constructor(pack) {
            super();
            this.ident = "sync_pack";
            this.pack = pack;
        }

        _recursivelyMountDirectory(base, struct, binary) {
            for (let entryKey in struct) {
                let entry = struct[entryKey];

                if (entry.type === "dir") {
                    this.mkdir(base + entry.originalName);
                    this._recursivelyMountDirectory(base + entry.originalName + "/", entry.children, binary);
                } else {
                    this.write(base + entry.originalName, binary.slice(entry.base, entry.base + entry.length));
                }
            }
        }

        async init() {
            let pack = this.pack;
            this.data = {};
            reportProgress("Fetching pack base " + pack);
            let metadata = await fetch(pack + ".json").then(res => res.json());
            if (metadata.type !== "sync") {
                throw new Error("Can't intialize syncfs from async pack!");
            }

            reportProgress("Fetching binary " + metadata.binary);
            let binary = await fetch(metadata.binary).then(res => res.arrayBuffer());

            if (metadata.compress) {
                reportProgress("Decompressing binary...");
                binary = pako.inflate(binary);
            }

            reportProgress("Mounting binary");

            this._recursivelyMountDirectory("/", metadata.children, binary);

            reportProgress("Mounted " + pack);
        }
    }

    class SingleFilePatch extends BasicMemoryBackedFilesystem {
        constructor(pack) {
            super();
            this.pack = pack;
            this.writable = false;
            this.sync = true;
        }

        async init() {
            let pack = this.pack;
            this.data = {};
            reportProgress("Fetching pack base " + pack);
            let metadata = await fetch(pack + ".json").then(res => res.json());
            if (metadata.type !== "single") {
                throw new Error("Can't intialize singlefs from multipak");
            }

            reportProgress("Fetching pack binary " + pack);
            let binary = await fetch(metadata.binary).then(res => res.arrayBuffer());

            console.time("a");
            this.write("/" + metadata.originalName, binary);
            console.timeEnd("a");
            reportProgress("Mounted " + pack);
        }
    }

    class AsyncFromPackFilesystem extends BasicMemoryBackedFilesystem {
        constructor(pack) {
            super();
            this.ident = "async_pack";
            this.pack = pack;

            this.writable = false;
            this.sync = false;
        }

        _recursivelyMountDirectory(base, struct) {
            for (let entryKey in struct) {
                let entry = struct[entryKey];

                if (entry.type === "dir") {
                    this.mkdir(base + entry.originalName);
                    this._recursivelyMountDirectory(base + entry.originalName + "/", entry.children);
                } else {
                    this.write(base + entry.originalName, entry.binary);
                }
            }
        }

        async init() {
            let pack = this.pack;
            this.data = {};
            reportProgress("Fetching pack base " + pack);
            let metadata = await fetch(pack + ".json").then(res => res.json());
            if (metadata.type !== "async") {
                throw new Error("Can't intialize asyncfs from sync pack!");
            }

            reportProgress("Mounting virtual binary");

            this._recursivelyMountDirectory("/", metadata.children);
        }

        async read(sPath) {
            let p = await super.read(sPath);
            return await fetch(p).then(res => res.arrayBuffer());
        }

        readRef(sPath) {
            let p = super.read(sPath);
            return p;
        }
    }

    class LocalstorageFilesystem extends BasicMemoryBackedFilesystem {
        constructor(id) { super(); this.ident = "localstorage"; this.key = id; }
        init() {
            if (localStorage.getItem("fsdata" + this.key)) {
                this.data = JSON.parse(localStorage.getItem("fsdata" + this.key));
            } else {
                this.data = {};
                localStorage.setItem("fsdata" + this.key, "{}");
            }
        }

        write( sPath, data ) {
            data = data.toString("utf-8");
            super.write(sPath, data);

            localStorage.setItem("fsdata" + this.key, JSON.stringify(this.data));
        }

        mkdir( sPath ) {
            super.mkdir(sPath);

            localStorage.setItem("fsdata" + this.key, JSON.stringify(this.data));
        }

        delete( sPath ) {
            super.delete(sPath);

            localStorage.setItem("fsdata" + this.key, JSON.stringify(this.data));
        }
    }

    class VFS {
        constructor() {
            this.mounts = [];
            // Mount base fs
            let base = new BasicMemoryBackedFilesystem();
            base.init();

            this.mounts.push(["/", base]);
        }

        _resolveFilesystem( absPath, mode, isSync, doMultiple, mustBeAsync ) { // returns: filesystem handle, input path normalized to be abs in the given filesystem
            checkAbsolute(absPath);

            let candidates = [];
            absPath = absPath.toLowerCase();


            for (let i = 0; i < this.mounts.length; i++) {
                let [mountPath, mountHandler] = this.mounts[i];
                if (absPath.startsWith(mountPath)) {
                    // Check handler
                    if (
                        (mode === "read" && mountHandler.readable) || 
                        (mode === "write" && mountHandler.writable) ||
                        (mode === "rw" && mountHandler.readable && mountHandler.writable)
                    ) {
                        let can = true;
                        if (isSync && !mountHandler.sync)
                            can = false;

                        if (mustBeAsync && mountHandler.sync)
                            can = false;
                        
                        if (!can)
                            continue;

                        let p = path.relative(mountPath, absPath);
                        p = `/${p}`;
                        p = path.normalize(p);

                        if (!doMultiple)
                            return [p, mountHandler];
                        else
                            candidates.push([p, mountHandler]);
                    }
                }
            }

            if (doMultiple)
                return candidates;
            else
                throw new Error("No candidates found!");
        }

        // We'll figure this out later...
        async mount( absPath, handler, replicateDirs ) {
            checkAbsolute(absPath);

            // Mkdir on the nearest possible r/w fs
            let c = this._resolveFilesystem(absPath, "rw", true, false);
            c[1].ensureDirTree(c[0]);

            await handler.init();

            if (replicateDirs) {
                let dirs = [];
                let recurisvelyScanForDirs = (base, wbase) => {
                    base = path.normalize(base);
                    wbase = path.normalize(wbase);
                    let a = this.readdir(base);
                    for (let o of a) {
                        if (this.stat(base + "/" + o).isDirectory()) {
                            dirs.push(wbase + "/" + o);
                            recurisvelyScanForDirs(base + "/" + o, wbase + "/" + o);
                        }
                    }
                }

                recurisvelyScanForDirs(absPath, "/");
                for (let entry of dirs) {
                    handler.ensureDirTree(entry);
                }
            }

            this.mounts.unshift([absPath, handler]);
        }

        readdir(absPath) {
            checkAbsolute(absPath);

            let files = new Set();
            let lc = new Set();
            absPath = absPath.toLowerCase();
            let c = this._resolveFilesystem(absPath, "read", false, true);
            absPath = absPath.toLowerCase();

            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                if (handler.exists(path)) {
                    if (handler.stat(path).isDirectory()) {
                        let handlerFiles = handler.readdir(path);
                        for (let entry of handlerFiles) {
                            if (!lc.has(entry.toLowerCase())) {
                                files.add(entry);
                                lc.add(entry.toLowerCase());
                            }
                        }
                    }
                }
            }

            return Array.from(files);
        }

        mkdir(absPath) {
            checkAbsolute(absPath);

            let c = this._resolveFilesystem(absPath, "write", false, false);
            c[1].mkdir(c[0]);
        }

        stat(absPath) {
            checkAbsolute(absPath);

            let c = this._resolveFilesystem(absPath, "read", false, true);
            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                if (handler.exists(path)) {
                    return handler.stat(path);
                }
            }

            throw new Error("File non existant.");
        }

        readSync(absPath) {
            checkAbsolute(absPath);

            let c = this._resolveFilesystem(absPath, "read", true, true);
            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                if (handler.exists(path)) {
                    return handler.readSync(path);
                }
            }
            
            throw new Error("File non existant.");
        }

        async read(absPath) {
            checkAbsolute(absPath);

            let c = this._resolveFilesystem(absPath, "read", false, true);
            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                if (handler.exists(path)) {
                    return (await handler.read(path));
                }
            }

            throw new Error("File non existant.");
        }

        readAsyncRef(absPath) {
            checkAbsolute(absPath);
            let c = this._resolveFilesystem(absPath, "read", false, true, true);

            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                if (handler.exists(path)) {
                    return handler.readRef(path);
                }
            }

            throw new Error("File non existant.");
        }

        write(absPath, data) {
            checkAbsolute(absPath);
            let dir = path.dirname(absPath);
            let compo = path.parse(absPath).base;

            let c = this._resolveFilesystem(dir, "write", false, false);

            c[1].ensureDirTree(path.normalize(c[0]));
            c[1].write(path.normalize(c[0] + "/" + compo), data);
        }

        exists(absPath) {
            checkAbsolute(absPath);

            let c = this._resolveFilesystem(absPath, "read", false, true);
            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                if (handler.exists(path)) {
                    return true;
                }
            }

            return false;
        }

        delete(absPath) {
            checkAbsolute(absPath);
            let dir = path.dirname(absPath);

            let c = this._resolveFilesystem(dir, "write", false, true);

            for (let i = 0; i < c.length; i++) {
                let [path, handler] = c[i];
                handler.delete(path);
            }
        }
    }

    window.vfs = new VFS();
    window.SyncFromPackFilesystem = SyncFromPackFilesystem;
    window.BasicWriteOnlyFilesystem = BasicWriteOnlyFileSystem;
    window.AsyncFromPackFilesystem = AsyncFromPackFilesystem;
    window.BasicMemoryBackedFilesystem = BasicMemoryBackedFilesystem;
    window.SingleFilePatch = SingleFilePatch;
    window.LocalstorageFilesystem = LocalstorageFilesystem;
})();