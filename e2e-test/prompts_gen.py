from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field


class T_Meta(BaseModel):
 temperature: float
 foobar: Optional['T_Meta_Foobar']
 zooBar: Optional['T_Meta_ZooBar']


type T_Meta_Foobar = Literal[
 'foo',
 'bar',
]


type T_Meta_ZooBar = Annotated[
 Union[
  'T_Meta_ZooBar_KindFoo',
  'T_Meta_ZooBar_KindBar',
 ],
 Field(discriminator="kind")
]


class T_Meta_ZooBar_KindFoo(BaseModel):
 kind: Literal['foo']
 foo: str


class T_Meta_ZooBar_KindBar(BaseModel):
 kind: Literal['bar']
 bar: str

