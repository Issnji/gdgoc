<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Review;
use Illuminate\Http\Request;

class WatchedController extends Controller
{
    // Menampilkan riwayat film yang ditonton user
    public function index()
    {
        $userId = auth('api')->id();

        $watched = Review::with('movie')
            ->where('user_id', $userId)
            ->get();

        return response()->json([
            'message' => 'Riwayat watched berhasil diambil.',
            'data' => $watched
        ], 200);
    }

    // Menambahkan film ke riwayat watched
    public function store(Request $request)
    {
        $validated = $request->validate([
            'movieId' => 'required|integer|exists:movies,id',
            'rating' => 'required|integer|between:1,5',
            'review' => 'nullable|string|max:1000',
        ]);

        $userId = auth('api')->id();

        // Periksa duplikasi
        $exists = Review::where('user_id', $userId)
            ->where('movie_id', $validated['movieId'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'Film sudah tercatat sebagai watched.'
            ], 409);
        }

        $watched = Review::create([
            'user_id' => $userId,
            'movie_id' => $validated['movieId'],
            'rating' => $validated['rating'],
            'review' => $validated['review'] ?? null,
        ]);

        return response()->json([
            'message' => 'Film berhasil dicatat sebagai watched.',
            'data' => $watched
        ], 201);
    }

    // Menghapus riwayat watched
    public function destroy($movie)
    {
        $userId = auth('api')->id();

        $watched = Review::where('movie_id', $movie)
            ->first();

        if (!$watched) {
            return response()->json([
                'message' => 'Riwayat watched tidak ditemukan.'
            ], 404);
        }

        // Periksa kepemilikan
        if ($watched->user_id != $userId) {
            return response()->json([
                'message' => 'Kamu tidak memiliki akses ke riwayat ini.'
            ], 403);
        }

        $watched->delete();

        return response()->json([
            'message' => 'Riwayat watched berhasil dihapus.'
        ], 200);
    }
}