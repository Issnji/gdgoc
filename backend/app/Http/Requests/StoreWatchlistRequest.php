<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreWatchlistRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'movieId' => [
                'required',
                'integer',
                'exists:movies,id',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'movieId.required' => 'Movie ID wajib diisi.',
            'movieId.exists' => 'Film tidak ditemukan.',
            'movieId.integer' => 'Movie ID harus berupa angka.',
        ];
    }
}