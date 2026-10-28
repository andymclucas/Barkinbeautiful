// Encode a directory of PNG frames into an H.264 MP4.
//
// There is no ffmpeg on this machine, so AVAssetWriter does the job —
// the same framework used earlier to read Andy's reference clip.
//
//   swift encode.swift <framesDir> <out.mp4> <fps>
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else { fputs("usage: encode.swift <framesDir> <out.mp4> <fps>\n", stderr); exit(2) }
let dir = args[1], outPath = args[2]
guard let fps = Int32(args[3]) else { fputs("bad fps\n", stderr); exit(2) }

let files = try FileManager.default.contentsOfDirectory(atPath: dir)
    .filter { $0.hasSuffix(".png") }.sorted()
guard let first = files.first,
      let probe = NSImage(contentsOfFile: "\(dir)/\(first)"),
      let probeCG = probe.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { fputs("no frames in \(dir)\n", stderr); exit(1) }
let W = probeCG.width, H = probeCG.height
print("\(files.count) frames, \(W)x\(H) @ \(fps)fps")

let url = URL(fileURLWithPath: outPath)
try? FileManager.default.removeItem(at: url)
let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)

// A high bitrate: the ground is a near-flat dark gradient, which is
// exactly what H.264 bands in, and the grain gives it plenty to chew.
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: W,
    AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [
        // Scaled to the frame: 14 Mbps at 1080p. The ground is a
        // near-flat dark gradient, which is exactly what H.264 bands
        // in, and the grain gives it plenty to chew.
        AVVideoAverageBitRateKey: Int(Double(W * H) * 6.75),
        AVVideoMaxKeyFrameIntervalKey: fps,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: W,
        kCVPixelBufferHeightKey as String: H,
    ])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let queue = DispatchQueue(label: "encode")
let done = DispatchSemaphore(value: 0)
var i = 0

input.requestMediaDataWhenReady(on: queue) {
    while input.isReadyForMoreMediaData {
        if i >= files.count {
            input.markAsFinished()
            writer.finishWriting { done.signal() }
            return
        }
        guard let img = NSImage(contentsOfFile: "\(dir)/\(files[i])"),
              let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let pool = adaptor.pixelBufferPool else { i += 1; continue }

        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
        guard let buffer = pb else { i += 1; continue }
        CVPixelBufferLockBaseAddress(buffer, [])
        if let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer), width: W, height: H,
            bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) {
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
        if i % 50 == 0 { print("  \(i)/\(files.count)") }
        i += 1
    }
}
done.wait()
if writer.status == .completed {
    let bytes = (try? FileManager.default.attributesOfItem(atPath: outPath)[.size] as? Int) ?? 0
    print("wrote \(outPath)  (\(String(format: "%.1f", Double(bytes ?? 0) / 1_048_576)) MB)")
} else {
    fputs("encode failed: \(String(describing: writer.error))\n", stderr); exit(1)
}
