import BigButton from './BigButton.js';
import dat from 'dat.gui/build/dat.gui.min.js';
import recorderTemplate from '../templates/recorder.vue!text';
import tracking from 'tracking/build/tracking-min.js';
import Vue from 'vue';

var imageFrames = [ 'frame1.png', 'frame2.png', 'frame3.png', 'frame4.png', 'frame5.png', 'frame6.png', 'frame7.png' ];
var imageFramesLoaded;
var imageFramesRandomisedIndex = -1;


var EmptyTracker = function() {
    EmptyTracker.base( this, 'constructor' );
};

tracking.inherits( EmptyTracker, tracking.Tracker );

EmptyTracker.prototype.track = function () {
    this.emit('track', { } );
};


// Browser polyfills
//===================

if (!navigator.getUserMedia) {
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia || navigator.msGetUserMedia;
}

function captureHighQualityVideoFrame () {

    return new Promise( function ( resolve, reject ) {

        var video = document.createElement( 'video' );
        video.width = 1024;
        video.height = 768;

        // Prefer camera resolution nearest to 1024x768.
        var constraints = { audio: false, video: { width: 1024, height: 768 } };

        navigator.mediaDevices.getUserMedia( constraints )
            .then( function ( mediaStream ) {

                video.srcObject = mediaStream;
                video.onloadedmetadata = function ( e ) {

                    video.play();
                    resolve( video ); // should have enough time to process
                    video.pause();
                    video = null;
                };
            } )
            .catch( reject );
    } );
}

function drawFrame ( canvas, context ) {

    var frame;

    if ( imageFramesRandomisedIndex === -1 ) {
        imageFramesRandomisedIndex = getRandomizedFrameIndex();
    }

    frame = imageFramesLoaded[ imageFramesRandomisedIndex ];

    context.drawImage( frame, 0, 0, canvas.width, canvas.height );
}

function getRandomizedFrameIndex () {

    return Math.floor( Math.random() * imageFramesLoaded.length );
}

function preloadAssets ( assets ) {

    var promises = assets.map( function ( asset ) {

        return new Promise( function ( resolve, reject ) {

            var loadedAsset = new Image();

            loadedAsset.addEventListener( 'load', function () {
                resolve( loadedAsset );
            });

            loadedAsset.addEventListener( 'error', function () {
                reject();
            });

            loadedAsset.src = 'assets/'+ asset;
        });
    });

    return Promise.all( promises );
}

function resetRandomizedFrameIndices () {
    imageFramesRandomisedIndex = -1;
}

export default Vue.component( 'recorder', {
    
    template: recorderTemplate,
    
    data: function () {
        return {
            audio: null,
            available: false,
            active: false,
            flashCamera: false,
            lastSnapshot: null,
            recordNow: false,
            trackerStarted: false
        };
    },

    created: function () {

        this.audio = document.createElement('audio');
        this.audio.preload = true;
        this.audio.src = 'assets/camera-click.mp3';

        preloadAssets( imageFrames ).then( function ( preloaded ) {

            imageFramesLoaded = preloaded;

            window.addEventListener( 'keyup', function ( e ) {
                var keyCode = e.keyCode;

                switch ( keyCode ) {

                    case 68:
                    case 27: // D, ESC
                        if ( this.lastSnapshot ) {
                            this.eraseLastSnapshot();
                        } else {
                            this.deactivate();
                        }
                        break;

                    case 65: // A
                        this.record(); // activate, record and save all together
                        break;

                    case 83: // S
                        this.saveLastSnapshot();
                        break;

                    case 39: // right arrow
                        resetRandomizedFrameIndices();
                        break;
                }
            }.bind( this ) );

            this.available = true;

        }.bind( this ) );
    },

    computed: {
        snapshotActionsActive: function () {
            return !!this.lastSnapshot;
        }
    },

    methods: {

        deactivate: function () {
            this.active = false;
            this.eraseLastSnapshot();
            this.$emit('deactivated');
        },

        eraseLastSnapshot: function () {
            if ( this.lastSnapshot ) {
                this.lastSnapshot = null;
                document.querySelector('.recorder-snapshot').style.backgroundImage ='';
            }
        },

        record: function () {

            if ( this.active ) {

                if ( ! this.lastSnapshot ) {
                    this.recordNow = true;
                } else {
                    this.saveLastSnapshot();
                }

            } else {
                this.$emit('activated');
                this.active = true;

                if ( ! this.trackerStarted ) {
                    this.trackerStarted = true;
                    this.startTracking();
                }
            }
        },

        saveLastSnapshot: function () {

            if ( this.lastSnapshot ) {

                var request = new XMLHttpRequest();
                request.open('POST', '/upload', true);
                request.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');

                request.onload = function () {

                    this.eraseLastSnapshot();
                    this.$emit('saved');

                }.bind( this );

                request.onerror = function () {

                    this.eraseLastSnapshot();
                    this.$emit('saved');
                }.bind( this );

                request.send( this.lastSnapshot.src );
            }
        },

        startTracking: function () {

            var video = document.getElementById( 'video' );
            var canvas = document.getElementById( 'canvas' );
            var context = canvas.getContext( '2d' );
            var tracker = new EmptyTracker();
            var gui;

            drawFrame( canvas, context );

            tracker.on( 'track', function ( event ) {

                context.clearRect( 0, 0, canvas.width, canvas.height );

                drawFrame( canvas, context );

                if ( this.recordNow ) {
                    this.takeSnapshot();
                    this.recordNow = false;
                }
            }.bind( this ) );

            tracking.track( '#video', tracker, { camera: true } );

            gui = new dat.GUI();
            gui.add( { randomizeFrame: resetRandomizedFrameIndices }, 'randomizeFrame' );
        },

        takeSnapshot: function () {
            var recorded = document.querySelector('.recorder-snapshot');
            var recordCanvas = document.createElement('canvas');
            var recordContext = recordCanvas.getContext('2d');
            var canvas = document.getElementById( 'canvas' );
            var video = document.getElementById( 'video' );

            this.audio.play();
            this.flashCamera = true;
            setTimeout( function () {
                this.flashCamera = false;
            }.bind( this ), 100);

            captureHighQualityVideoFrame().then( function ( highQualityVideo ) {

                var scaleFactor = highQualityVideo.width / video.width;

                recordCanvas.width = highQualityVideo.width;
                recordCanvas.height = highQualityVideo.height;

                recordContext.clearRect( 0, 0, recordCanvas.width, recordCanvas.height );

                recordContext.save();
                recordContext.scale( -1, 1 );
                recordContext.drawImage( highQualityVideo, 0, 0, recordCanvas.width * -1, recordCanvas.height);
                recordContext.restore();

                drawFrame( recordCanvas, recordContext );

                recorded.style.backgroundImage = 'url(\''+ recordCanvas.toDataURL().replace(/(\r\n|\n|\r)/gm, '') +'\')';

                this.lastSnapshot = new Image();
                this.lastSnapshot.src = recordCanvas.toDataURL('image/png');
            }.bind( this ) );
        }
    }
});