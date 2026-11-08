<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreWatchedRequest extends FormRequest
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
            'rating' => [
                'required',
                'integer',
                'between:1,5',
            ],
            'review' => [
                'nullable',
                'string',
                'max:1000',
            ],
        ];
    }
}