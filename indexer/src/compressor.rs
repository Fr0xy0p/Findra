/// Variable-Byte (VByte) / Varint compression for posting list document ID deltas (d-gaps).
/// Provides high compression ratios with zero runtime heap allocation overhead.

pub struct VByteCompressor;

impl VByteCompressor {
    /// Encode an unsigned 32-bit integer into a variable number of bytes (7 bits per byte, MSB 1 = continue).
    pub fn encode_u32(mut val: u32, out: &mut Vec<u8>) {
        loop {
            let byte = (val & 0x7F) as u8;
            val >>= 7;
            if val == 0 {
                out.push(byte); // MSB = 0 indicates final byte
                break;
            } else {
                out.push(byte | 0x80); // MSB = 1 indicates more bytes follow
            }
        }
    }

    /// Decode a sequence of variable bytes back into an unsigned 32-bit integer.
    pub fn decode_u32(bytes: &[u8], offset: &mut usize) -> Option<u32> {
        let mut result = 0u32;
        let mut shift = 0;

        while *offset < bytes.len() {
            let byte = bytes[*offset];
            *offset += 1;
            result |= ((byte & 0x7F) as u32) << shift;
            if (byte & 0x80) == 0 {
                return Some(result);
            }
            shift += 7;
            if shift >= 35 {
                return None; // Overflow guard
            }
        }
        None
    }

    /// Compress a strictly increasing list of document IDs into delta-gap encoded varints.
    pub fn compress_doc_ids(doc_ids: &[u32]) -> Vec<u8> {
        let mut compressed = Vec::with_capacity(doc_ids.len() * 2);
        let mut last_id = 0u32;

        for &id in doc_ids {
            let delta = id - last_id;
            Self::encode_u32(delta, &mut compressed);
            last_id = id;
        }
        compressed
    }

    /// Decompress a sequence of delta-gap varints back into original document IDs.
    pub fn decompress_doc_ids(bytes: &[u8]) -> Vec<u32> {
        let mut doc_ids = Vec::new();
        let mut offset = 0;
        let mut current_id = 0u32;

        while let Some(delta) = Self::decode_u32(bytes, &mut offset) {
            current_id += delta;
            doc_ids.push(current_id);
        }
        doc_ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vbyte_roundtrip() {
        let original_ids = vec![3, 10, 42, 100, 105, 500, 10000, 100000];
        let compressed = VByteCompressor::compress_doc_ids(&original_ids);
        let decompressed = VByteCompressor::decompress_doc_ids(&compressed);
        assert_eq!(original_ids, decompressed);
    }
}

