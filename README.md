# Inspectron

A dynamic analysis tool that uses an instrumented version of the Electron framework to audit cross-platform apps.

Instrumented Electron
--------

We have made existing instrumented versions of Electron available to download on [Box](https://uofi.box.com/s/7x5j12c0ced0bvvytah6ykth2qa5s9k8).


Once downloaded, you can copy the resources of the app you wish to evaluate within `Contents/Resources` within  instrumented Electron.

Run the app using the Puppeteer script provided under `src/puppeteer-script.js`. The script runs the app, opens and plugs in through a remote debugging port.

Instrumentation Scripts
--------

To instrument newer versions of Electron, we have added files that we instrument within the Electron framework under the `src/build-scripts` directory. Look for comments that include the string `[inspectron]` to locate modifications.

Electron provides extensive documentation on downloading and building specific versions of the framework using their [build tools](https://github.com/electron/build-tools).

Citation
--------

If you use Inspectron in your research, please cite our USENIX 2024 publication on the tool. You can use the following BibTeX.

    @inproceedings{ali2024inspectron,
        author = {Ali, Mir Masood and Ghasemisharif, Mohammad and Kanich, Chris and Polakis, Jason},
        title = {Rise of {Inspectron}: {Automated} {Black-box} {Auditing} of {Cross-platform} {Electron} {Apps}},
        booktitle = {33rd USENIX Security Symposium  (USENIX Security 24)},
        address = {Philadelphia, PA},
        isbn = {978-1-939133-44-1},
        pages = {775--792},
        url = {https://www.usenix.org/conference/usenixsecurity24/presentation/ali},
        publisher = {USENIX Association},
        month = {aug},
        year = {2024}
    }

License
--------

Inspectron is licensed under GNU GPLv3.
