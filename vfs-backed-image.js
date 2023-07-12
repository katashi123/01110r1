(function() {
    let oldImage = Image;

    window.Image = class FakeImage extends oldImage {
        constructor() {super();this.oldsrc = "";}

        set src(url) {
            this.oldsrc = url;
            if (url.startsWith("blob:")) {
                super.src = url;
                return;
            }

            if (url == "" || !url) {
                super.src = url;
                this.oldsrc = url;
                return;
            }

            console.log(url);
            window.vfs.read(window._NODE_PATH.join(process.cwd(), url)).then(a => {
                let data = URL.createObjectURL(new Blob([a]));
                console.log(data);
                super.src = data;
            });
        }

        get src() {
            return this.oldsrc;
        }
    }
})();

(function() {
    let a = document.createElement.bind(document);

    class FakeScript extends HTMLElement {
        constructor() {
            super();
            let shadow = this.attachShadow({mode: "open"});
            let scriptElement = a("script");
            this.s = scriptElement;
            shadow.appendChild(scriptElement);
        }
    
        static get observedAttributes() {
            return ["src", "innerText", "innerHTML"];
        }

        resolveFunkySrc(src) {
            if (src.startsWith("js/")) {
                let data = window.vfs.readSync(window._NODE_PATH.join(process.cwd(), src));
                let a = URL.createObjectURL(new Blob([data]));

                this.s.src = a;
            } else {
                this.s.src = src;
            }
        }
    
        set src(value) {
            this.resolveFunkySrc(value);
        }

        set innerText(value) {
            this.s.innerText = value;
        }

        set innerHTML(value) {
            this.s.innerHTML = value;
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (name === "innerText") {
                this.s.innerText = newValue;
            }

            if (name === "innerHTML") {
                this.s.innerHTML = newValue;
            }


            if (name === "src") {
                this.resolveFunkySrc(value);
            }
        }

        connectedCallback() {

        }
    }

    customElements.define("funky-script", FakeScript);

    document.createElement = (type) => {
        if (type.toLowerCase() !== "script") {
            return a(type);
        } else {
            return a("funky-script");
        }
    }
})();

(function() {
    let oldxhr = XMLHttpRequest;

    window.XMLHttpRequest = class FakeXHR extends oldxhr {
        constructor() {
            super();
            this.bufferOpen = false;
            this.hasOpened = false;
        }

        open(reqType, url) {
            if (url.startsWith("img") || url.startsWith("audio")) {
                this.bufferOpen = true;
                try {
                    url = decodeURIComponent(url);
                }catch(e){}
                    //super.open(reqType, vfs.readAsyncRef(path.join(process.cwd(), url)));
                    vfs.read(path.join(process.cwd(), url)).then(a => {
                        let data = URL.createObjectURL(new Blob([a], {type: (url.startsWith("img")) ? "image/png" : undefined}));

                        super.open(reqType, data);
                        if (this.bufferOpen && this.hasOpened) {
                            super.send();
                        }

                        this.bufferOpen = false;
                        this.hasOpened = false;
                    }).catch(a => {

                    });
            } else {
                super.open(reqType, url);
            }
        }

        send() {
            if (!this.bufferOpen) {
                super.send();
            } else {
                this.hasOpened = true;
            }
        }
    }
})();