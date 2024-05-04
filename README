## TypeScript-Video-Encoder

This is a rewrite of the Codec From Scratch repo originally done in Go.
All credit goes to Github user kevmo314 for the logic.
Please see the [original repo](https://github.com/kevmo314/codec-from-scratch) for more detailed information.

To run this locally:

`npm install`

`cat video.rgb24 | npm run start`

Example run:

```
➜  ts-video-encodder git:(main) cat video.rgb24 | npm run start

> ts-video-encodder@0.0.1 start
> npx tsc && node dist/index.js

Raw size: 53996544 bytes
YUV420p size: 26998272 bytes (50% original size)
Wrote encoded.yuv
RLE size: 13592946 bytes (25.17% original size)
Deflated size: 5743033 bytes (10.64% original size)
Wrote decoded.yuv
Wrote decoded.rgb24
➜  ts-video-encodder git:(main)
```

To play the decoded file:

`ffplay -f rawvideo -pixel_format rgb24 -video_size 384x216 -framerate 25 decoded.rgb24`

You can do the same for the YUV files if you'd like:

`ffplay -f rawvideo -pixel_format rgb24 -video_size 384x216 -framerate 25 decoded.yuv`
